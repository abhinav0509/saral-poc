-- pgTAP · DB hardening invariants + patient RPCs (P1).
-- Run with: supabase test db
-- These cover the deterministic, definer/constraint behaviour that needs no
-- auth simulation. Full RLS-isolation tests (anon cannot list visits, cross-
-- clinic denial) land with the P2 RLS flip, since they require seeded auth
-- users + JWT role simulation.

BEGIN;
SELECT plan(14);

-- ---------- fixtures ----------
INSERT INTO clinics (id, code, name, address, doctor_name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tc', 'Test Clinic', 'Test City', 'Dr. Test');

-- ---------- public_token ----------
INSERT INTO visits (id, clinic_id, token, patient_name, source, status)
VALUES ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-01', 'Asha', 'qr', 'waiting');

SELECT isnt(
  (SELECT public_token FROM visits WHERE id = '11111111-0000-0000-0000-000000000001'),
  NULL,
  'public_token is auto-populated on insert'
);

-- ---------- token-per-day uniqueness ----------
SELECT throws_ok(
  $$ INSERT INTO visits (clinic_id, token, patient_name, source, status)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-01', 'Dup', 'qr', 'waiting') $$,
  '23505',
  NULL,
  'duplicate token same clinic same day is rejected'
);

-- ---------- one now_serving per clinic ----------
UPDATE visits SET status = 'now_serving', started_at = now()
WHERE id = '11111111-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$ INSERT INTO visits (clinic_id, token, patient_name, source, status, started_at)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-02', 'Second', 'qr', 'now_serving', now()) $$,
  '23505',
  NULL,
  'a second now_serving in the same clinic is rejected'
);

-- ---------- unique non-dropped slot ----------
INSERT INTO visits (clinic_id, token, patient_name, source, status, booked_for)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-03', 'Booked', 'online', 'waiting', '2026-06-03T10:00:00+05:30');

SELECT throws_ok(
  $$ INSERT INTO visits (clinic_id, token, patient_name, source, status, booked_for)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-04', 'Clash', 'online', 'waiting', '2026-06-03T10:00:00+05:30') $$,
  '23505',
  NULL,
  'two live bookings on the same slot are rejected'
);

SELECT lives_ok(
  $$ INSERT INTO visits (clinic_id, token, patient_name, source, status, booked_for)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-05', 'Dropped', 'online', 'dropped', '2026-06-03T10:00:00+05:30') $$,
  'a dropped booking may reuse a slot'
);

-- ---------- prescriptions.clinic_id trigger ----------
INSERT INTO prescriptions (visit_id, typed_meds)
VALUES ('11111111-0000-0000-0000-000000000001', '[]'::jsonb);

SELECT is(
  (SELECT clinic_id FROM prescriptions WHERE visit_id = '11111111-0000-0000-0000-000000000001'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'prescriptions.clinic_id is auto-filled from the visit'
);

-- ---------- get_clinic_public ----------
SELECT is(
  (get_clinic_public('tc') ->> 'name'),
  'Test Clinic',
  'get_clinic_public returns the clinic by code'
);
SELECT is(
  get_clinic_public('nope'),
  NULL,
  'get_clinic_public returns NULL for an unknown code'
);

-- ---------- create_self_checkin ----------
SELECT is(
  (create_self_checkin('tc', 'Walkin Wanda', 30, 'F', '+91 98765 43210', 'Fever', NULL) ->> 'token'),
  'T-06',
  'create_self_checkin allocates the next per-day token'
);

SELECT is(
  (SELECT count(*)::int FROM visits WHERE clinic_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND patient_name = 'Walkin Wanda'),
  1,
  'create_self_checkin inserts a waiting visit'
);

SELECT throws_ok(
  $$ SELECT create_self_checkin('tc', 'Slot Clash', 40, 'M', '9000000000', NULL, '2026-06-03T10:00:00+05:30') $$,
  'SLOT_CONFLICT',
  'create_self_checkin raises SLOT_CONFLICT on a taken slot'
);

-- ---------- get_visit_public ----------
SELECT is(
  (get_visit_public((SELECT public_token FROM visits WHERE id = '11111111-0000-0000-0000-000000000001')) #>> '{visit,token}'),
  'T-01',
  'get_visit_public returns the visit by public_token'
);

-- ---------- cancel_visit_public ----------
SELECT is(
  (cancel_visit_public((SELECT public_token FROM visits WHERE token = 'T-03' AND clinic_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) ->> 'ok'),
  'true',
  'cancel_visit_public drops a waiting visit'
);

SELECT * FROM finish();
ROLLBACK;
