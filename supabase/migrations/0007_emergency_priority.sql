-- ============================================================
-- SARAL · 0007 · EMERGENCY PRIORITY + QUEUE TIMELINE PUSH
-- Makes the Emergency button real: visits carry a priority so an
-- emergency jumps to the top of the queue; clinics carry a "running
-- behind" delay (minutes) that the patient-facing ETA respects; and
-- a cancel_reason lets the patient page show warm, specific copy when
-- the clinic has to stop for the day. Additive + idempotent.
-- ============================================================

-- ---------- visits.priority (0 = normal, 1 = emergency) ----------
-- Queue order becomes (priority DESC, joined_at ASC): emergencies first,
-- FIFO within each tier. Extensible to triage levels later.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;

-- ---------- visits.cancel_reason ----------
-- Why a visit was dropped. 'clinic_emergency' drives the warm patient
-- message ("the clinic had to close early"). NULL for normal cancels.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS cancel_reason text;

-- ---------- clinics running-behind offset (the push-wait knob) ----------
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS delay_minutes int NOT NULL DEFAULT 0;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS delay_set_at  timestamptz;

-- ---------- ordering index over the live queue ----------
CREATE INDEX IF NOT EXISTS visits_clinic_priority_idx
  ON visits(clinic_id, priority DESC, joined_at)
  WHERE status IN ('waiting', 'now_serving');

-- ---------- realtime: publish clinics so a delay bump reaches patients live ----------
-- (visits + prescriptions were added in 0001; clinics was not.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clinics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clinics;
  END IF;
END $$;

-- ============================================================
-- get_visit_public — now priority-aware and delay-aware.
--   ahead_count : waiting visits that sort BEFORE me under
--                 (priority DESC, joined_at ASC)
--   eta_minutes : ahead_count * 6 + clinic.delay_minutes
--   + clinic_delay_minutes, is_emergency, visit.cancel_reason in payload
-- ============================================================
CREATE OR REPLACE FUNCTION get_visit_public(p_public_token uuid)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v       visits;
  c       clinics;
  v_ahead int;
  v_mini  jsonb;
  v_presc jsonb;
BEGIN
  SELECT * INTO v FROM visits WHERE public_token = p_public_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM clinics WHERE id = v.clinic_id;

  IF v.status = 'waiting' THEN
    SELECT count(*) INTO v_ahead
    FROM visits w
    WHERE w.clinic_id = v.clinic_id
      AND w.status = 'waiting'
      AND (
        w.priority > v.priority
        OR (w.priority = v.priority AND w.joined_at < v.joined_at)
      );
  ELSE
    v_ahead := 0;
  END IF;

  -- Anonymised mini-queue: a 5-slot window around this patient, tokens only.
  WITH active AS (
    SELECT id, token, status,
           row_number() OVER (ORDER BY priority DESC, joined_at) AS rn,
           count(*) OVER () AS total
    FROM visits
    WHERE clinic_id = v.clinic_id AND status IN ('waiting', 'now_serving')
  ), mer AS (
    SELECT rn, total FROM active WHERE id = v.id
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'token', a.token,
             'kind', CASE WHEN a.id = v.id THEN 'you'
                          WHEN a.status = 'now_serving' THEN 'now'
                          ELSE 'wait' END
           ) ORDER BY a.rn
         ), '[]'::jsonb)
  INTO v_mini
  FROM active a CROSS JOIN mer
  WHERE a.rn BETWEEN greatest(1, least(mer.rn - 2, mer.total - 4))
                 AND greatest(1, least(mer.rn - 2, mer.total - 4)) + 4;

  IF v.status = 'done' THEN
    SELECT jsonb_build_object(
      'photo_url', p.photo_url,
      'typed_meds', p.typed_meds,
      'follow_up_note', p.follow_up_note,
      'sent_at', p.sent_at
    ) INTO v_presc
    FROM prescriptions p
    WHERE p.visit_id = v.id
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'visit', jsonb_build_object(
      'id', v.id,
      'clinic_id', v.clinic_id,
      'public_token', v.public_token,
      'token', v.token,
      'patient_name', v.patient_name,
      'age', v.age,
      'gender', v.gender,
      'reason', v.reason,
      'status', v.status,
      'priority', v.priority,
      'cancel_reason', v.cancel_reason,
      'booked_for', v.booked_for,
      'ended_at', v.ended_at
    ),
    'clinic', jsonb_build_object(
      'code', c.code, 'name', c.name, 'address', c.address, 'doctor_name', c.doctor_name
    ),
    'ahead_count', v_ahead,
    'eta_minutes', v_ahead * 6 + coalesce(c.delay_minutes, 0),
    'clinic_delay_minutes', coalesce(c.delay_minutes, 0),
    'is_emergency', (v.priority > 0),
    'mini_queue', coalesce(v_mini, '[]'::jsonb),
    'prescription', v_presc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_visit_public(uuid) TO anon, authenticated;
