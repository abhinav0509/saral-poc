-- pgTAP · Phase 2 invariants — emergency priority (0007), RLS isolation (0008),
-- invite auto-accept + broadcast (0009).
-- Run with:  supabase test db   (needs Docker + the local stack)
--
-- RLS tests simulate auth by setting the role + request.jwt.claims GUC, so
-- auth.uid() / auth_clinic_ids() resolve exactly as they do for a real JWT.

BEGIN;
SELECT plan(14);

-- ---------- fixtures: two clinics, two users ----------
INSERT INTO clinics (id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'qa_a', 'QA Clinic A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'qa_b', 'QA Clinic B');

-- u1 is an admin of clinic A (for the RLS member test)
INSERT INTO auth.users (instance_id, id, aud, role, phone) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', '+919000000001');
INSERT INTO clinic_members (user_id, clinic_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin');

-- visits: A has a normal + an emergency; B has one normal
INSERT INTO visits (id, clinic_id, token, patient_name, source, status, priority) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-01', 'A-Normal', 'qr', 'waiting', 0),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-02', 'A-Emergency', 'qr', 'waiting', 1),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'T-01', 'B-Normal', 'qr', 'waiting', 0);

UPDATE clinics SET delay_minutes = 10 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ========== 0007 · emergency priority + delay in get_visit_public ==========
SELECT is(
  (get_visit_public((SELECT public_token FROM visits WHERE id = 'dddddddd-0000-0000-0000-000000000001')) ->> 'ahead_count')::int,
  1, 'a normal patient counts the emergency ahead of them');
SELECT is(
  (get_visit_public((SELECT public_token FROM visits WHERE id = 'dddddddd-0000-0000-0000-000000000001')) ->> 'eta_minutes')::int,
  16, 'eta = ahead(1)*6 + clinic delay(10) = 16');
SELECT is(
  (get_visit_public((SELECT public_token FROM visits WHERE id = 'dddddddd-0000-0000-0000-000000000002')) ->> 'ahead_count')::int,
  0, 'the emergency sits at the front of the queue');
SELECT is(
  (get_visit_public((SELECT public_token FROM visits WHERE id = 'dddddddd-0000-0000-0000-000000000002')) ->> 'is_emergency'),
  'true', 'is_emergency flag is set for the emergency visit');

-- ========== 0009 · broadcast functions exist ==========
SELECT has_function('public'::name, 'broadcast_visit_change'::name);
SELECT has_function('public'::name, 'broadcast_clinic_change'::name);

-- ========== 0008 · RLS isolation — anon ==========
SET LOCAL role anon;
SELECT is((SELECT count(*)::int FROM visits),  0, 'anon cannot list visits directly');
SELECT is((SELECT count(*)::int FROM clinics), 0, 'anon cannot list clinics directly');
SELECT is((get_clinic_public('qa_a') ->> 'code'), 'qa_a', 'anon CAN still call the SECURITY DEFINER RPC');
RESET role;

-- ========== 0008 · RLS isolation — authenticated member of A ==========
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM visits), 2, 'member of A sees only A''s 2 visits');
SELECT is((SELECT count(*)::int FROM visits WHERE clinic_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0, 'member of A cannot see clinic B''s visits');
RESET role;

-- ========== 0009 · accept_my_invites links a pending phone invite ==========
INSERT INTO clinic_invites (clinic_id, phone, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', '9000000002', 'receptionist');
INSERT INTO auth.users (instance_id, id, aud, role, phone) VALUES
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', '+919000000002');

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
SELECT ok(accept_my_invites() >= 1, 'accept_my_invites() links the matching pending invite');
RESET role;

SELECT is(
  (SELECT count(*)::int FROM clinic_members
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND clinic_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1, 'membership row created from the invite');
SELECT is(
  (SELECT count(*)::int FROM clinic_invites WHERE phone = '9000000002' AND accepted_at IS NOT NULL),
  1, 'the invite is marked accepted');

SELECT * FROM finish();
ROLLBACK;
