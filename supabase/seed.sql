-- ============================================================
-- SARAL · POC SEED DATA
-- Run after schema.sql in Supabase Dashboard → SQL Editor
-- Safe to re-run: clears clinic + cascading data first.
-- ============================================================

-- Reset (cascades to visits + prescriptions + events)
DELETE FROM clinics WHERE code = 'drmehta';

-- Dr. Mehta's Clinic
INSERT INTO clinics (id, code, name, address, doctor_name) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'drmehta',
   'Dr. Mehta''s Clinic',
   'MG Road, Bengaluru',
   'Dr. Mehta');

-- Starting queue (1 serving + 3 waiting)
INSERT INTO visits (clinic_id, token, patient_name, age, gender, mobile, source, status, reason, started_at, joined_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'T-07', 'Aakash Pillai', 41, 'M', '+919876543207', 'online', 'now_serving', 'Follow-up',           now() - interval '4 minutes',  now() - interval '38 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'T-08', 'Riya Sharma',   34, 'F', '+919876543208', 'online', 'waiting',     'Follow-up · fever',   null,                          now() - interval '25 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'T-09', 'Aman Verma',    28, 'M', '+919876543209', 'qr',     'waiting',     'New · sore throat',   null,                          now() - interval '15 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'T-10', 'Meera Iyer',    45, 'F', '+919876543210', 'phone',  'waiting',     'Follow-up · BP',      null,                          now() - interval '6 minutes');
