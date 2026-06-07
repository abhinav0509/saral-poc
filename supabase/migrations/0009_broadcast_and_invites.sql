-- ============================================================
-- SARAL · 0009 · INVITE AUTO-ACCEPT RPC + PATIENT BROADCAST
-- Companion to the RLS flip (0008). Two pieces:
--   1. accept_my_invites() — links a signed-in user's pending phone
--      invites on login (replaces the auth.users trigger, which is
--      privilege-blocked on the hosted project).
--   2. Patient Broadcast — after the flip, anon can't read tables, so
--      the patient live page can't use postgres_changes. DB triggers
--      emit a PII-free "clinic_changed" signal to a PUBLIC per-clinic
--      topic; the patient client refetches via the SECURITY DEFINER RPC
--      (so authorization still lives in the RPC, not the broadcast).
-- Additive + idempotent.
-- ============================================================

-- ---------- 1. invite auto-accept ----------
CREATE OR REPLACE FUNCTION accept_my_invites()
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_phone10 text;
  v_n       int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;

  SELECT right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
  INTO v_phone10
  FROM auth.users WHERE id = v_uid;

  -- Ensure a profile row exists (the on-signup trigger is skipped on this project).
  INSERT INTO profiles (id, phone)
  SELECT v_uid, phone FROM auth.users WHERE id = v_uid
  ON CONFLICT (id) DO NOTHING;

  IF coalesce(v_phone10, '') = '' THEN RETURN 0; END IF;

  INSERT INTO clinic_members (user_id, clinic_id, role)
  SELECT v_uid, ci.clinic_id, ci.role
  FROM clinic_invites ci
  WHERE ci.accepted_at IS NULL
    AND right(regexp_replace(ci.phone, '\D', '', 'g'), 10) = v_phone10
  ON CONFLICT (user_id, clinic_id) DO NOTHING;

  UPDATE clinic_invites
  SET accepted_at = now()
  WHERE accepted_at IS NULL
    AND right(regexp_replace(phone, '\D', '', 'g'), 10) = v_phone10;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_my_invites() TO authenticated;

-- ---------- 2. patient broadcast ----------
-- visits + prescriptions carry clinic_id directly.
CREATE OR REPLACE FUNCTION broadcast_visit_change()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid := coalesce(NEW.clinic_id, OLD.clinic_id);
BEGIN
  IF v_clinic IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
      'clinic_changed',
      'clinic:' || v_clinic::text,
      false  -- public topic: unauthenticated patients can subscribe
    );
  END IF;
  RETURN NULL;
END;
$$;

-- clinics is keyed by id (the "running behind" delay update).
CREATE OR REPLACE FUNCTION broadcast_clinic_change()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('table', 'clinics', 'op', TG_OP),
    'clinic_changed',
    'clinic:' || coalesce(NEW.id, OLD.id)::text,
    false
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS visits_broadcast ON visits;
CREATE TRIGGER visits_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON visits
  FOR EACH ROW EXECUTE FUNCTION broadcast_visit_change();

DROP TRIGGER IF EXISTS prescriptions_broadcast ON prescriptions;
CREATE TRIGGER prescriptions_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION broadcast_visit_change();

DROP TRIGGER IF EXISTS clinics_broadcast ON clinics;
CREATE TRIGGER clinics_broadcast
  AFTER UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION broadcast_clinic_change();
