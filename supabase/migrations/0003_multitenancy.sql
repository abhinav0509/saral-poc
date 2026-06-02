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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

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
