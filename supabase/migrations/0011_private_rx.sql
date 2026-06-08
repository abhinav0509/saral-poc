-- 0011_private_rx.sql — Private prescriptions bucket + signed-URL access (DPDP)
--
-- Prescriptions hold patients' medical images. Until now the bucket was PUBLIC
-- (0001) and prescriptions.photo_url stored a permanent, never-expiring public
-- URL — anyone who ever saw the link (forwarded on WhatsApp, cached, indexed)
-- could fetch the file forever. This locks the bucket down:
--   * Staff (authenticated, scoped to their clinic) read/write objects directly.
--   * Patients get a SHORT-LIVED signed URL minted by the `rx-url` Edge Function
--     against their visit's public_token (service role) — no permanent link.
-- prescriptions.photo_url now stores the bare object PATH ("<visit_id>/<file>"),
-- never a URL.

-- 1. Flip the bucket to private.
UPDATE storage.buckets SET public = false WHERE id = 'prescriptions';

-- 2. Drop the permissive POC storage policies (anyone could read/write).
DROP POLICY IF EXISTS "poc_storage_read"  ON storage.objects;
DROP POLICY IF EXISTS "poc_storage_write" ON storage.objects;

-- 3. Staff access, scoped by visit → clinic membership.
--    Object path is "<visit_id>/<timestamp>.<ext>"; the first segment is the
--    visit. Compare as text so a non-UUID name can never raise a cast error
--    inside the policy (it just won't match).
DO $$ BEGIN
  CREATE POLICY "rx_staff_read" ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'prescriptions'
      AND EXISTS (
        SELECT 1 FROM visits v
        WHERE v.id::text = split_part(name, '/', 1)
          AND v.clinic_id IN (SELECT auth_clinic_ids())
      )
    );
  CREATE POLICY "rx_staff_write" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'prescriptions'
      AND EXISTS (
        SELECT 1 FROM visits v
        WHERE v.id::text = split_part(name, '/', 1)
          AND v.clinic_id IN (SELECT auth_clinic_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (The service role used by the rx-url Edge Function bypasses RLS, so patient
--  signed URLs work without a patient-facing storage policy.)

-- 4. Migrate existing rows: full public URL → bare object path.
--    e.g. https://<proj>.supabase.co/storage/v1/object/public/prescriptions/<vid>/<f>.jpg
--    →    <vid>/<f>.jpg
UPDATE prescriptions
   SET photo_url = regexp_replace(photo_url, '^.*/prescriptions/', '')
 WHERE photo_url IS NOT NULL
   AND photo_url LIKE '%/prescriptions/%';

-- Verify (run manually after apply):
--   SELECT public FROM storage.buckets WHERE id='prescriptions';            -- f
--   SELECT polname FROM pg_policies WHERE tablename='objects'
--     AND polname LIKE 'rx_%';                                              -- 2 rows
--   SELECT photo_url FROM prescriptions WHERE photo_url IS NOT NULL LIMIT 5; -- paths, no http
