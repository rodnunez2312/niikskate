-- Brand logo and ramp photo uploads for Admin → Skateshop / Skateramps.
--
-- storage.objects only ever had policies for products/ and avatars/, so every
-- write to brands/ was denied by RLS. The admin UI used to fall back to
-- URL.createObjectURL on failure, which is exactly why a brand logo rendered
-- for whoever uploaded it and was a broken image for everyone else.
--
-- skateramps/ has the same gap: the reference photos on the ramp design studio
-- upload to that prefix with no policy behind them.
--
-- Prerequisite: bucket "images" exists and is PUBLIC (Dashboard → Storage).
-- Public read is already granted by add_product_image_storage_policies.sql.

DROP POLICY IF EXISTS "Admins upload brand and ramp images" ON storage.objects;
CREATE POLICY "Admins upload brand and ramp images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] IN ('brands', 'skateramps')
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Needed because the logo upload uses upsert: re-uploading a brand overwrites.
DROP POLICY IF EXISTS "Admins update brand and ramp images" ON storage.objects;
CREATE POLICY "Admins update brand and ramp images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] IN ('brands', 'skateramps')
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins delete brand and ramp images" ON storage.objects;
CREATE POLICY "Admins delete brand and ramp images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] IN ('brands', 'skateramps')
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);
