-- Skater profile photos: avatars/{user_id}/avatar.jpg
--
-- Do NOT insert into storage.buckets here — the SQL Editor role is not owner of
-- storage.buckets and will error: "must be owner of table buckets".
--
-- Before running this migration:
-- 1. Supabase Dashboard → Storage → ensure bucket "images" exists (create it,
--    public, if you use it for shop images too).
-- 2. Then run this file in the SQL Editor (policies on storage.objects only).

-- Read objects via public URLs (skip if you already have a public-read policy on this bucket)
DROP POLICY IF EXISTS "Public read storage images" ON storage.objects;
CREATE POLICY "Public read storage images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- Users may insert/update/delete only inside their own avatars folder
DROP POLICY IF EXISTS "Skaters upload own avatar files" ON storage.objects;
CREATE POLICY "Skaters upload own avatar files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS "Skaters update own avatar files" ON storage.objects;
CREATE POLICY "Skaters update own avatar files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS "Skaters delete own avatar files" ON storage.objects;
CREATE POLICY "Skaters delete own avatar files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
);
