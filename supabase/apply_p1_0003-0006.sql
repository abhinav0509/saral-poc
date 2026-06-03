-- ==============================================================
-- SARAL · Phase 1 · apply migrations 0003–0006 in one go.
-- Safe/additive: adds tenancy, public_token, constraints, RPCs.
-- Does NOT change the existing permissive RLS (that's Phase 2).
-- Run this whole script once in the Supabase SQL Editor.
-- ==============================================================


-- ====================== 0003_multitenancy.sql ======================
-- ============================================================
-- SARAL · 0003 · MULTI-TENANCY + AUTH
-- Adds real accounts (phone OTP via Supabase Auth) and clinic
-- membership/roles. Additive only — existing permissive RLS on
-- clinics/visits/etc. is left intact and flipped to authenticated
-- policies in a later migration (P2) once apps are cut over.
-- ============================================================

-- Roles a staff user can hold within a clinic.
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('admin', 'doctor', 'receptionist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per authenticated user (1:1 with auth.users).
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A user's membership + role in a clinic. Supports staff who work at
-- more than one clinic (multi-clinic from day one).
CREATE TABLE IF NOT EXISTS clinic_members (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id  uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  role       staff_role NOT NULL DEFAULT 'receptionist',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS clinic_members_user_idx   ON clinic_members(user_id);
CREATE INDEX IF NOT EXISTS clinic_members_clinic_idx ON clinic_members(clinic_id);

-- Pre-authorises a phone number for a clinic before that person signs in.
-- When they verify OTP, the on-auth trigger turns this into a membership.
CREATE TABLE IF NOT EXISTS clinic_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  role        staff_role NOT NULL DEFAULT 'receptionist',
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_invites_phone_idx  ON clinic_invites(phone);
CREATE INDEX IF NOT EXISTS clinic_invites_clinic_idx ON clinic_invites(clinic_id);

-- ============================================================
-- Helper functions (SECURITY DEFINER so RLS policies can use them
-- without recursing on clinic_members).
-- ============================================================

-- Clinic ids the calling user belongs to.
CREATE OR REPLACE FUNCTION auth_clinic_ids()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_clinic_member(p_clinic uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clinic_members
    WHERE user_id = auth.uid() AND clinic_id = p_clinic
  )
$$;

CREATE OR REPLACE FUNCTION is_clinic_admin(p_clinic uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clinic_members
    WHERE user_id = auth.uid() AND clinic_id = p_clinic AND role = 'admin'
  )
$$;

GRANT EXECUTE ON FUNCTION auth_clinic_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION is_clinic_member(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION is_clinic_admin(uuid)   TO authenticated;

-- ============================================================
-- On new auth user: create a profile and auto-accept any pending
-- invite that matches the phone (compared on the last 10 digits so
-- "+91…", "91…", and bare 10-digit numbers all match — India).
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone10 text := right(regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g'), 10);
BEGIN
  INSERT INTO profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.phone)
  ON CONFLICT (id) DO NOTHING;

  IF v_phone10 <> '' THEN
    INSERT INTO clinic_members (user_id, clinic_id, role)
    SELECT NEW.id, ci.clinic_id, ci.role
    FROM clinic_invites ci
    WHERE ci.accepted_at IS NULL
      AND right(regexp_replace(ci.phone, '\D', '', 'g'), 10) = v_phone10
    ON CONFLICT (user_id, clinic_id) DO NOTHING;

    UPDATE clinic_invites ci
    SET accepted_at = now()
    WHERE ci.accepted_at IS NULL
      AND right(regexp_replace(ci.phone, '\D', '', 'g'), 10) = v_phone10;
  END IF;

  RETURN NEW;
END;
$$;

-- Creating a trigger on auth.users requires ownership of that table
-- (supabase_auth_admin). The SQL editor's role may lack it, so make this
-- non-fatal — the trigger is only needed once phone-OTP auth is wired (P2),
-- not for the patient flow. If it's skipped here, create it later as the
-- auth admin (or via the Supabase dashboard Auth hooks).
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[saral] Skipped on_auth_user_created trigger — insufficient privilege on auth.users. Create it later as supabase_auth_admin.';
  WHEN others THEN
    RAISE NOTICE '[saral] Skipped on_auth_user_created trigger: %', SQLERRM;
END $$;

-- ============================================================
-- RLS · new tables only (authenticated). anon has no policy here,
-- so anon is denied — these tables are never patient-facing.
-- ============================================================

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- profiles: a user sees/edits only their own row.
  CREATE POLICY "profiles_self_select" ON profiles
    FOR SELECT TO authenticated USING (id = auth.uid());
  CREATE POLICY "profiles_self_upsert" ON profiles
    FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
  CREATE POLICY "profiles_self_update" ON profiles
    FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  -- clinic_members: members can read their clinic's roster; only admins write.
  CREATE POLICY "members_read_own_clinics" ON clinic_members
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT auth_clinic_ids()));
  CREATE POLICY "members_admin_write" ON clinic_members
    FOR ALL TO authenticated
    USING (is_clinic_admin(clinic_id))
    WITH CHECK (is_clinic_admin(clinic_id));

  -- clinic_invites: members can read their clinic's invites; only admins write.
  CREATE POLICY "invites_read_own_clinics" ON clinic_invites
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT auth_clinic_ids()));
  CREATE POLICY "invites_admin_write" ON clinic_invites
    FOR ALL TO authenticated
    USING (is_clinic_admin(clinic_id))
    WITH CHECK (is_clinic_admin(clinic_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ====================== 0004_visits_hardening.sql ======================
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

-- ---------- service_date (materialised IST day for per-day token uniqueness) ----------
-- A timestamptz -> date cast is only STABLE (timezone-dependent), so it cannot
-- live in an index expression. We materialise the IST calendar day in a column
-- via a BEFORE INSERT trigger and build the unique index on plain columns.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS service_date date;
UPDATE visits
SET service_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE service_date IS NULL;

CREATE OR REPLACE FUNCTION set_visit_service_date()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.service_date IS NULL THEN
    NEW.service_date := (coalesce(NEW.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visits_set_service_date ON visits;
CREATE TRIGGER visits_set_service_date
  BEFORE INSERT ON visits
  FOR EACH ROW EXECUTE FUNCTION set_visit_service_date();

ALTER TABLE visits ALTER COLUMN service_date SET NOT NULL;

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
  ON visits(clinic_id, token, service_date);

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

-- ====================== 0005_onboarding_rpcs.sql ======================
-- ============================================================
-- SARAL · 0005 · ONBOARDING + STAFF INVITE RPCs
-- SECURITY DEFINER so a brand-new clinic can self-serve and admins
-- can pre-authorise staff. All calls are gated by auth.uid()/role.
-- ============================================================

-- Create a clinic and make the caller its admin. Used the first time a
-- clinic signs up. Returns the new clinic row.
CREATE OR REPLACE FUNCTION create_clinic_and_admin(
  p_name        text,
  p_code        text,
  p_address     text DEFAULT NULL,
  p_doctor_name text DEFAULT NULL
)
  RETURNS clinics
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic clinics;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF coalesce(btrim(p_name), '') = '' OR coalesce(btrim(p_code), '') = '' THEN
    RAISE EXCEPTION 'Clinic name and code are required';
  END IF;

  INSERT INTO clinics (code, name, address, doctor_name)
  VALUES (lower(btrim(p_code)), btrim(p_name), p_address, p_doctor_name)
  RETURNING * INTO v_clinic;

  INSERT INTO clinic_members (user_id, clinic_id, role)
  VALUES (v_uid, v_clinic.id, 'admin')
  ON CONFLICT (user_id, clinic_id) DO UPDATE SET role = 'admin';

  RETURN v_clinic;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A clinic with code "%" already exists', lower(btrim(p_code))
    USING errcode = '23505';
END;
$$;

-- Pre-authorise a staff phone for a clinic. Only that clinic's admins may
-- call. If the phone already belongs to the clinic, this is a no-op.
-- Returns the invite id (NULL when the person is already a member).
CREATE OR REPLACE FUNCTION invite_staff(
  p_clinic uuid,
  p_phone  text,
  p_role   staff_role DEFAULT 'receptionist'
)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_phone10 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_invite  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF NOT is_clinic_admin(p_clinic) THEN
    RAISE EXCEPTION 'Only a clinic admin can invite staff' USING errcode = '42501';
  END IF;
  IF length(v_phone10) < 10 THEN
    RAISE EXCEPTION 'A valid 10-digit phone number is required';
  END IF;

  -- Already a member (via an existing profile with this phone)? No-op.
  IF EXISTS (
    SELECT 1
    FROM clinic_members cm
    JOIN profiles pr ON pr.id = cm.user_id
    WHERE cm.clinic_id = p_clinic
      AND right(regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g'), 10) = v_phone10
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO clinic_invites (clinic_id, phone, role, invited_by)
  VALUES (p_clinic, v_phone10, p_role, v_uid)
  RETURNING id INTO v_invite;

  RETURN v_invite;
END;
$$;

GRANT EXECUTE ON FUNCTION create_clinic_and_admin(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION invite_staff(uuid, text, staff_role)            TO authenticated;

-- ====================== 0006_patient_rpcs.sql ======================
-- ============================================================
-- SARAL · 0006 · PATIENT-FACING RPCs (anon)
-- Unauthenticated patients reach Saral only through these SECURITY
-- DEFINER functions, keyed by an opaque token or clinic code. They
-- never return other patients' PII and never allow listing/enumeration,
-- so after the P2 RLS flip anon can keep zero direct table access.
-- ============================================================

-- Public clinic info for the walk-in landing (/walkin/[code]).
CREATE OR REPLACE FUNCTION get_clinic_public(p_code text)
  RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', code, 'name', name, 'address', address, 'doctor_name', doctor_name
  )
  FROM clinics
  WHERE code = lower(btrim(p_code))
$$;

-- Everything the live visit page needs (/v/[public_token]) in one call:
-- the visit, its clinic, queue position + ETA, an anonymised mini-queue
-- (tokens only), and the prescription once the visit is done.
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
      AND w.joined_at < v.joined_at;
  ELSE
    v_ahead := 0;
  END IF;

  -- Anonymised mini-queue: a 5-slot window around this patient, tokens only.
  WITH active AS (
    SELECT id, token, status,
           row_number() OVER (ORDER BY joined_at) AS rn,
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
      'booked_for', v.booked_for,
      'ended_at', v.ended_at
    ),
    'clinic', jsonb_build_object(
      'code', c.code, 'name', c.name, 'address', c.address, 'doctor_name', c.doctor_name
    ),
    'ahead_count', v_ahead,
    'eta_minutes', v_ahead * 6,
    'mini_queue', coalesce(v_mini, '[]'::jsonb),
    'prescription', v_presc
  );
END;
$$;

-- Slot availability for a clinic on a given IST calendar day, for the
-- patient self-check-in slot picker. Returns raw booked timestamps +
-- doctor blocks (no patient identities); the client builds the booked map.
CREATE OR REPLACE FUNCTION get_slot_availability(p_code text, p_date date)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_start  timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_end    timestamptz := (p_date::text || ' 23:59:59.999')::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_books  jsonb;
  v_blocks jsonb;
BEGIN
  SELECT id INTO v_clinic FROM clinics WHERE code = lower(btrim(p_code));
  IF v_clinic IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(booked_for) ORDER BY booked_for), '[]'::jsonb)
  INTO v_books
  FROM visits
  WHERE clinic_id = v_clinic
    AND booked_for IS NOT NULL
    AND status <> 'dropped'
    AND booked_for BETWEEN v_start AND v_end;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'starts_at', starts_at, 'ends_at', ends_at, 'kind', kind, 'title', title
         ) ORDER BY starts_at), '[]'::jsonb)
  INTO v_blocks
  FROM clinic_blocks
  WHERE clinic_id = v_clinic
    AND starts_at <= v_end
    AND ends_at >= v_start;

  RETURN jsonb_build_object('bookings', v_books, 'blocks', v_blocks);
END;
$$;

-- Atomic patient self-check-in: resolve clinic by code, allocate the
-- per-day token under an advisory lock, and insert the visit in one
-- transaction. Raises SLOT_CONFLICT if the chosen slot was just taken.
CREATE OR REPLACE FUNCTION create_self_checkin(
  p_code       text,
  p_name       text,
  p_age        int,
  p_gender     text,
  p_mobile     text,
  p_reason     text DEFAULT NULL,
  p_booked_for timestamptz DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_day    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_max    int;
  v_token  text;
  v_row    visits;
BEGIN
  SELECT id INTO v_clinic FROM clinics WHERE code = lower(btrim(p_code));
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;
  IF length(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'MOBILE_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinic::text || ':' || v_day::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(token, '\D', '', 'g'), '')::int), 0)
  INTO v_max
  FROM visits
  WHERE clinic_id = v_clinic
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_day;
  v_token := 'T-' || lpad((v_max + 1)::text, 2, '0');

  BEGIN
    INSERT INTO visits (clinic_id, token, patient_name, age, gender, mobile, source, status, reason, booked_for)
    VALUES (
      v_clinic, v_token, btrim(p_name), p_age, p_gender,
      right(regexp_replace(p_mobile, '\D', '', 'g'), 10),
      'qr', 'waiting', nullif(btrim(coalesce(p_reason, '')), ''), p_booked_for
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- The slot uniqueness index fired — someone took this time first.
    RAISE EXCEPTION 'SLOT_CONFLICT' USING errcode = '23505';
  END;

  RETURN jsonb_build_object('public_token', v_row.public_token, 'token', v_row.token);
END;
$$;

-- Patient cancels their own visit by token.
CREATE OR REPLACE FUNCTION cancel_visit_public(p_public_token uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row visits;
BEGIN
  UPDATE visits
  SET status = 'dropped', ended_at = now()
  WHERE public_token = p_public_token
    AND status IN ('waiting', 'now_serving')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_row.status);
END;
$$;

-- anon (patients) + authenticated (staff app previews) may call these.
GRANT EXECUTE ON FUNCTION get_clinic_public(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_visit_public(uuid)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_slot_availability(text, date)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_self_checkin(text, text, int, text, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_visit_public(uuid)                       TO anon, authenticated;
