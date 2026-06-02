-- ============================================================
-- SARAL · POC SCHEMA
-- Run this once in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enums --------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE visit_source AS ENUM ('online', 'qr', 'phone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM ('waiting', 'now_serving', 'done', 'dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables -------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  address     text,
  doctor_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  token         text NOT NULL,
  patient_name  text NOT NULL,
  age           int,
  gender        text,
  mobile        text,
  source        visit_source NOT NULL DEFAULT 'qr',
  status        visit_status NOT NULL DEFAULT 'waiting',
  reason        text,
  booked_for    timestamptz,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_clinic_status_idx ON visits(clinic_id, status);
CREATE INDEX IF NOT EXISTS visits_clinic_joined_idx ON visits(clinic_id, joined_at);
CREATE INDEX IF NOT EXISTS visits_token_idx           ON visits(token);

CREATE TABLE IF NOT EXISTS prescriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  photo_url       text,
  typed_meds      jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_note  text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid REFERENCES clinics(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS · permissive for POC. Will tighten before production.
-- (Anon key can read & write everything — necessary because we have
-- no real user accounts in v1; access is gated by URL only.)
ALTER TABLE clinics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "poc_all_read"  ON clinics       FOR SELECT USING (true);
  CREATE POLICY "poc_all_write" ON clinics       FOR ALL    USING (true) WITH CHECK (true);
  CREATE POLICY "poc_all_read"  ON visits        FOR SELECT USING (true);
  CREATE POLICY "poc_all_write" ON visits        FOR ALL    USING (true) WITH CHECK (true);
  CREATE POLICY "poc_all_read"  ON prescriptions FOR SELECT USING (true);
  CREATE POLICY "poc_all_write" ON prescriptions FOR ALL    USING (true) WITH CHECK (true);
  CREATE POLICY "poc_all_read"  ON events        FOR SELECT USING (true);
  CREATE POLICY "poc_all_write" ON events        FOR ALL    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime · so clients can subscribe to live queue changes
ALTER PUBLICATION supabase_realtime ADD TABLE visits;
ALTER PUBLICATION supabase_realtime ADD TABLE prescriptions;

-- Storage bucket for prescription photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "poc_storage_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'prescriptions');

  CREATE POLICY "poc_storage_write"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'prescriptions');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
