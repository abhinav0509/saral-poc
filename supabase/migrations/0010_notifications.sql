-- ============================================================
-- SARAL · 0010 · NOTIFICATIONS (staff push + patient WhatsApp)
-- A durable message_outbox filled by SECURITY DEFINER enqueue triggers and
-- drained by the `dispatch-outbox` Edge Function (Expo push + WhatsApp Cloud
-- API). Enqueue NEVER rolls back a clinical write (every trigger is exception
-- -guarded). WhatsApp rows sit `pending` until the Edge function has the
-- WhatsApp secrets — i.e. the pipeline is dormant-but-wired until approval.
--
-- After applying: deploy the Edge Functions and create a Database Webhook on
-- message_outbox (INSERT) → dispatch-outbox (Dashboard → Database → Webhooks).
-- That webhook is what drains the outbox; no pg_cron/pg_net needed.
-- ============================================================

-- ---------- device_push_tokens ----------
CREATE TABLE IF NOT EXISTS device_push_tokens (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id  uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  expo_token text NOT NULL,
  platform   text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinic_id, expo_token)
);
CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_token_idx ON device_push_tokens(expo_token);
CREATE INDEX IF NOT EXISTS device_push_tokens_clinic_idx ON device_push_tokens(clinic_id);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
-- A signed-in user manages only their own tokens. (Dispatch reads via service role.)
CREATE POLICY push_tokens_self ON device_push_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------- message_outbox ----------
CREATE TABLE IF NOT EXISTS message_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid REFERENCES clinics(id) ON DELETE CASCADE,
  visit_id      uuid REFERENCES visits(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('push','whatsapp')),
  recipient     text NOT NULL,                 -- expo token | E.164 phone
  event         text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text UNIQUE,                    -- idempotency
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','canceled')),
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  provider_id   text,                           -- WhatsApp message id (for webhook receipts)
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON message_outbox(status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS outbox_provider_idx ON message_outbox(provider_id) WHERE provider_id IS NOT NULL;

-- RLS on, NO policies → no client (anon/authenticated) access. Only SECURITY
-- DEFINER enqueue triggers and the service-role Edge function touch this table.
ALTER TABLE message_outbox ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- helpers
-- ============================================================
CREATE OR REPLACE FUNCTION saral_e164(p_mobile text)
  RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(p_mobile,''), '\D', '', 'g')) >= 10
    THEN '+91' || right(regexp_replace(p_mobile, '\D', '', 'g'), 10)
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION enqueue_message(
  p_clinic uuid, p_visit uuid, p_channel text, p_recipient text,
  p_event text, p_payload jsonb, p_dedupe text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(btrim(p_recipient), '') = '' THEN RETURN; END IF;
  INSERT INTO message_outbox (clinic_id, visit_id, channel, recipient, event, payload, dedupe_key)
  VALUES (p_clinic, p_visit, p_channel, p_recipient, p_event, p_payload, p_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[saral] enqueue_message failed: %', SQLERRM;
END $$;

-- Base URL for patient links (matches apps/staff/lib/config.ts).
-- Override with: ALTER DATABASE postgres SET app.patient_base = 'https://...';
CREATE OR REPLACE FUNCTION saral_patient_base()
  RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.patient_base', true), ''), 'https://saral-poc.vercel.app')
$$;

-- ============================================================
-- enqueue triggers
-- ============================================================

-- visits INSERT → staff push (new walk-in / emergency) + patient booking confirmation
CREATE OR REPLACE FUNCTION notify_visit_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_name text;
  v_url  text := saral_patient_base() || '/v/' || NEW.public_token::text;
  v_phone text := saral_e164(NEW.mobile);
  v_first text := coalesce(nullif(split_part(btrim(NEW.patient_name),' ',1),''),'there');
  r RECORD;
  v_event text;
  v_title text;
  v_body  text;
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = NEW.clinic_id;

  -- staff push (walk-ins via self-check-in, or any emergency intake)
  IF NEW.source = 'qr' OR NEW.priority > 0 THEN
    IF NEW.priority > 0 THEN
      v_event := 'emergency_at_reception';
      v_title := '🚨 Emergency at reception';
      v_body  := v_first || ' needs urgent attention.';
    ELSE
      v_event := 'new_walkin';
      v_title := 'New walk-in';
      v_body  := v_first || ' joined the queue (' || NEW.token || ').';
    END IF;
    FOR r IN SELECT expo_token FROM device_push_tokens WHERE clinic_id = NEW.clinic_id LOOP
      PERFORM enqueue_message(NEW.clinic_id, NEW.id, 'push', r.expo_token, v_event,
        jsonb_build_object('title', v_title, 'body', v_body, 'data', jsonb_build_object('route','/queue')),
        'push:'||v_event||':'||NEW.id::text||':'||r.expo_token);
    END LOOP;
  END IF;

  -- patient WhatsApp: booking/self-check-in confirmation
  IF v_phone IS NOT NULL THEN
    PERFORM enqueue_message(NEW.clinic_id, NEW.id, 'whatsapp', v_phone, 'booking_confirmation',
      jsonb_build_object('template','booking_confirmation',
        'variables', jsonb_build_array(v_first, coalesce(v_clinic_name,'the clinic'), NEW.token, v_url),
        'fallback_text', 'Namaste '||v_first||', you''re checked in at '||coalesce(v_clinic_name,'the clinic')||
                         '. Your token is '||NEW.token||'. Track your live queue here: '||v_url),
      'confirm:'||NEW.id::text);
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[saral] notify_visit_insert failed: %', SQLERRM;
  RETURN NULL;
END $$;

-- visits UPDATE → your-turn (on call-in), clinic-closed, emergency-flag push
CREATE OR REPLACE FUNCTION notify_visit_update()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_name text;
  nxt RECORD;
  r RECORD;
  v_first text;
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = NEW.clinic_id;

  -- someone was just called in → notify the new next-in-line patient
  IF NEW.status = 'now_serving' AND OLD.status <> 'now_serving' THEN
    SELECT * INTO nxt FROM visits
    WHERE clinic_id = NEW.clinic_id AND status = 'waiting'
    ORDER BY priority DESC, joined_at ASC LIMIT 1;
    IF nxt.id IS NOT NULL AND saral_e164(nxt.mobile) IS NOT NULL THEN
      v_first := coalesce(nullif(split_part(btrim(nxt.patient_name),' ',1),''),'there');
      PERFORM enqueue_message(NEW.clinic_id, nxt.id, 'whatsapp', saral_e164(nxt.mobile), 'queue_your_turn_near',
        jsonb_build_object('template','queue_your_turn_near',
          'variables', jsonb_build_array(v_first, coalesce(v_clinic_name,'the clinic'), nxt.token),
          'fallback_text','Namaste '||v_first||', you''re up next at '||coalesce(v_clinic_name,'the clinic')||
                          ' (token '||nxt.token||'). Please head back now.'),
        'turn:'||nxt.id::text);
    END IF;
  END IF;

  -- clinic closed the day → warm apology
  IF NEW.status = 'dropped' AND NEW.cancel_reason = 'clinic_emergency'
     AND OLD.status <> 'dropped' AND saral_e164(NEW.mobile) IS NOT NULL THEN
    v_first := coalesce(nullif(split_part(btrim(NEW.patient_name),' ',1),''),'there');
    PERFORM enqueue_message(NEW.clinic_id, NEW.id, 'whatsapp', saral_e164(NEW.mobile), 'clinic_closed',
      jsonb_build_object('template','clinic_closed',
        'variables', jsonb_build_array(v_first, coalesce(v_clinic_name,'the clinic')),
        'fallback_text','Namaste '||v_first||', '||coalesce(v_clinic_name,'the clinic')||
                        ' had to stop earlier than planned today due to an emergency. So sorry — please book again.'),
      'closed:'||NEW.id::text);
  END IF;

  -- promoted to emergency after the fact → staff push
  IF NEW.priority > 0 AND OLD.priority = 0 THEN
    v_first := coalesce(nullif(split_part(btrim(NEW.patient_name),' ',1),''),'there');
    FOR r IN SELECT expo_token FROM device_push_tokens WHERE clinic_id = NEW.clinic_id LOOP
      PERFORM enqueue_message(NEW.clinic_id, NEW.id, 'push', r.expo_token, 'emergency_at_reception',
        jsonb_build_object('title','🚨 Emergency at reception','body',v_first||' needs urgent attention.',
          'data', jsonb_build_object('route','/queue')),
        'push:emergency_at_reception:'||NEW.id::text||':'||r.expo_token);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[saral] notify_visit_update failed: %', SQLERRM;
  RETURN NULL;
END $$;

-- prescriptions INSERT → "prescription ready" (links to the live page)
CREATE OR REPLACE FUNCTION notify_prescription_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD; v_clinic_name text; v_first text; v_phone text; v_url text;
BEGIN
  SELECT * INTO v FROM visits WHERE id = NEW.visit_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_phone := saral_e164(v.mobile);
  IF v_phone IS NULL THEN RETURN NULL; END IF;
  SELECT name INTO v_clinic_name FROM clinics WHERE id = v.clinic_id;
  v_first := coalesce(nullif(split_part(btrim(v.patient_name),' ',1),''),'there');
  v_url := saral_patient_base() || '/v/' || v.public_token::text;
  PERFORM enqueue_message(v.clinic_id, v.id, 'whatsapp', v_phone, 'prescription_ready',
    jsonb_build_object('template','prescription_ready',
      'variables', jsonb_build_array(v_first, coalesce(v_clinic_name,'the clinic'), v_url),
      'fallback_text','Namaste '||v_first||', your prescription from '||coalesce(v_clinic_name,'the clinic')||
                      ' is ready. View it here: '||v_url),
    'rx:'||NEW.id::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[saral] notify_prescription_insert failed: %', SQLERRM;
  RETURN NULL;
END $$;

-- clinics UPDATE → "running behind" to each waiting patient (once per bump)
CREATE OR REPLACE FUNCTION notify_clinic_update()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_first text; v_stamp text;
BEGIN
  IF coalesce(NEW.delay_minutes,0) > coalesce(OLD.delay_minutes,0) THEN
    v_stamp := coalesce(NEW.delay_set_at, now())::text;
    FOR r IN SELECT * FROM visits WHERE clinic_id = NEW.id AND status = 'waiting' LOOP
      IF saral_e164(r.mobile) IS NOT NULL THEN
        v_first := coalesce(nullif(split_part(btrim(r.patient_name),' ',1),''),'there');
        PERFORM enqueue_message(NEW.id, r.id, 'whatsapp', saral_e164(r.mobile), 'appointment_delayed',
          jsonb_build_object('template','appointment_delayed',
            'variables', jsonb_build_array(v_first, NEW.name, NEW.delay_minutes::text),
            'fallback_text','Namaste '||v_first||', the doctor at '||NEW.name||' is handling an emergency and is '||
                            'running about '||NEW.delay_minutes||' minutes behind. Thank you for your patience.'),
          'delay:'||NEW.id::text||':'||v_stamp||':'||r.id::text);
      END IF;
    END LOOP;
    END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[saral] notify_clinic_update failed: %', SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS visits_notify_insert ON visits;
CREATE TRIGGER visits_notify_insert AFTER INSERT ON visits
  FOR EACH ROW EXECUTE FUNCTION notify_visit_insert();
DROP TRIGGER IF EXISTS visits_notify_update ON visits;
CREATE TRIGGER visits_notify_update AFTER UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION notify_visit_update();
DROP TRIGGER IF EXISTS prescriptions_notify_insert ON prescriptions;
CREATE TRIGGER prescriptions_notify_insert AFTER INSERT ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION notify_prescription_insert();
DROP TRIGGER IF EXISTS clinics_notify_update ON clinics;
CREATE TRIGGER clinics_notify_update AFTER UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION notify_clinic_update();

-- Dispatch is driven by a Database Webhook on message_outbox (INSERT) →
-- dispatch-outbox. Retrying *failed* sends (a cron sweep) is a later add-on.
