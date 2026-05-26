-- Doctor unavailability blocks: surgeries, emergencies, leaves, meetings.
-- Source of truth for "doctor is busy" — slot picker reads from here
-- alongside the visits table to compute true availability.

CREATE TABLE clinic_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('surgery','emergency','leave','meeting','other')),
  title text NOT NULL,
  patient_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT block_time_valid CHECK (ends_at > starts_at)
);

CREATE INDEX idx_clinic_blocks_clinic_starts ON clinic_blocks(clinic_id, starts_at);
CREATE INDEX idx_clinic_blocks_range ON clinic_blocks(clinic_id, starts_at, ends_at);

-- Realtime: needed so all open clients re-fetch when blocks change
ALTER PUBLICATION supabase_realtime ADD TABLE clinic_blocks;

-- RLS — POC: permissive. Will lock down with auth in v1.1
ALTER TABLE clinic_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access to clinic_blocks"
  ON clinic_blocks FOR ALL
  USING (true) WITH CHECK (true);
