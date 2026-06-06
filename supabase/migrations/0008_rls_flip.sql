-- ============================================================
-- SARAL · 0008 · RLS FLIP (apply LAST, after native auth is live)
-- Drops the POC "allow everyone" policies and replaces them with real
-- per-clinic policies for the `authenticated` role. Unauthenticated
-- patients keep working ONLY through the SECURITY DEFINER RPCs in 0006
-- (which bypass RLS) — anon loses all direct table access, killing
-- enumeration. Run this in a maintenance window once staff are signing
-- in via the native app and at least one clinic_member row exists.
--
-- NOTE: this is the point web-staff (anon, no auth) stops loading data,
-- and patient pages fall back from instant postgres_changes to the 30s
-- poll until the Broadcast rework lands. Storage stays public this phase
-- (private bucket + signed URLs is P4).
-- ============================================================

-- Ensure RLS is on for the tenancy tables (policies from 0003 are inert without it).
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_invites ENABLE ROW LEVEL SECURITY;

-- ---------- clinics ----------
DROP POLICY IF EXISTS "poc_all_read"  ON clinics;
DROP POLICY IF EXISTS "poc_all_write" ON clinics;
-- INSERT happens only via create_clinic_and_admin() (SECURITY DEFINER) — no direct insert policy.
CREATE POLICY clinics_member_select ON clinics
  FOR SELECT TO authenticated
  USING (id IN (SELECT auth_clinic_ids()));
CREATE POLICY clinics_member_update ON clinics
  FOR UPDATE TO authenticated
  USING (id IN (SELECT auth_clinic_ids()))
  WITH CHECK (id IN (SELECT auth_clinic_ids()));

-- ---------- visits ----------
DROP POLICY IF EXISTS "poc_all_read"  ON visits;
DROP POLICY IF EXISTS "poc_all_write" ON visits;
CREATE POLICY visits_member_all ON visits
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT auth_clinic_ids()))
  WITH CHECK (clinic_id IN (SELECT auth_clinic_ids()));

-- ---------- prescriptions (clinic_id denormalised in 0004) ----------
DROP POLICY IF EXISTS "poc_all_read"  ON prescriptions;
DROP POLICY IF EXISTS "poc_all_write" ON prescriptions;
CREATE POLICY rx_member_all ON prescriptions
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT auth_clinic_ids()))
  WITH CHECK (clinic_id IN (SELECT auth_clinic_ids()));

-- ---------- clinic_blocks ----------
DROP POLICY IF EXISTS "anon full access to clinic_blocks" ON clinic_blocks;
CREATE POLICY blocks_member_all ON clinic_blocks
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT auth_clinic_ids()))
  WITH CHECK (clinic_id IN (SELECT auth_clinic_ids()));

-- ---------- events ----------
DROP POLICY IF EXISTS "poc_all_read"  ON events;
DROP POLICY IF EXISTS "poc_all_write" ON events;
CREATE POLICY events_member_all ON events
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT auth_clinic_ids()))
  WITH CHECK (clinic_id IN (SELECT auth_clinic_ids()));

-- Storage (prescriptions bucket) intentionally left public this phase — see header.
