-- ============================================================
-- SARAL · 0004 · VISITS / PRESCRIPTIONS HARDENING
-- Opaque patient tokens, denormalised clinic_id on prescriptions,
-- concurrency invariants enforced at the DB layer, and indexes for
-- the hot read paths. Additive + backfilling; safe to run once.
-- ============================================================

-- ---------- visits.public_token (unguessable patient URL key) ----------
-- The human "T-NN" token is a per-day counter and trivially guessable, so it
-- must not gate patient access. public_token is what /v/[token] URLs use.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS public_token uuid;
UPDATE visits SET public_token = gen_random_uuid() WHERE public_token IS NULL;
ALTER TABLE visits ALTER COLUMN public_token SET DEFAULT gen_random_uuid();
ALTER TABLE visits ALTER COLUMN public_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS visits_public_token_idx ON visits(public_token);

-- ---------- prescriptions.clinic_id (denormalised for RLS + queries) ----------
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE;

-- Backfill from the parent visit.
UPDATE prescriptions p
SET clinic_id = v.clinic_id
FROM visits v
WHERE p.visit_id = v.id AND p.clinic_id IS NULL;

-- Keep it filled automatically on insert/update from the parent visit.
CREATE OR REPLACE FUNCTION set_prescription_clinic_id()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT v.clinic_id INTO NEW.clinic_id FROM visits v WHERE v.id = NEW.visit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prescriptions_set_clinic ON prescriptions;
CREATE TRIGGER prescriptions_set_clinic
  BEFORE INSERT OR UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION set_prescription_clinic_id();

ALTER TABLE prescriptions ALTER COLUMN clinic_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS prescriptions_clinic_created_idx ON prescriptions(clinic_id, created_at DESC);

-- ============================================================
-- Concurrency invariants — enforced by the DB, not racy JS preflights.
-- ============================================================

-- At most one patient "now_serving" per clinic.
CREATE UNIQUE INDEX IF NOT EXISTS visits_one_now_serving_idx
  ON visits(clinic_id)
  WHERE status = 'now_serving';

-- No two live (non-dropped) bookings on the same exact slot in a clinic.
CREATE UNIQUE INDEX IF NOT EXISTS visits_unique_slot_idx
  ON visits(clinic_id, booked_for)
  WHERE booked_for IS NOT NULL AND status <> 'dropped';

-- Token is a per-day counter, so it must be unique per clinic per IST day.
CREATE UNIQUE INDEX IF NOT EXISTS visits_token_per_day_idx
  ON visits(clinic_id, token, ((created_at AT TIME ZONE 'Asia/Kolkata')::date));

-- ============================================================
-- Read-path indexes (booking / calendar / today / search / reminders).
-- ============================================================
CREATE INDEX IF NOT EXISTS visits_clinic_booked_idx  ON visits(clinic_id, booked_for);
CREATE INDEX IF NOT EXISTS visits_clinic_created_idx ON visits(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visits_active_idx
  ON visits(clinic_id)
  WHERE status IN ('waiting', 'now_serving');

-- ============================================================
-- Atomic per-clinic-per-day token allocation. Use inside a single
-- transaction together with the INSERT so the advisory lock holds
-- (the patient self-check-in RPC does exactly this). The unique index
-- above is the backstop for any path that doesn't.
-- ============================================================
CREATE OR REPLACE FUNCTION next_token_for_clinic(p_clinic uuid)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_day  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_max  int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_clinic::text || ':' || v_day::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(token, '\D', '', 'g'), '')::int), 0)
  INTO v_max
  FROM visits
  WHERE clinic_id = p_clinic
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_day;
  RETURN 'T-' || lpad((v_max + 1)::text, 2, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_token_for_clinic(uuid) TO authenticated;
