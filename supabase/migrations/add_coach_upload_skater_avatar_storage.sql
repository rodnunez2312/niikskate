-- Coaches/admins may upload avatar files for customer profiles (coach student dashboard).

DROP POLICY IF EXISTS "Coaches upload skater avatar files" ON storage.objects;
CREATE POLICY "Coaches upload skater avatar files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles coach
    WHERE coach.id = auth.uid()
      AND coach.role IN ('admin', 'coach')
  )
  AND EXISTS (
    SELECT 1 FROM profiles skater
    WHERE skater.id::text = split_part(name, '/', 2)
      AND skater.role = 'customer'
  )
);

DROP POLICY IF EXISTS "Coaches update skater avatar files" ON storage.objects;
CREATE POLICY "Coaches update skater avatar files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles coach
    WHERE coach.id = auth.uid()
      AND coach.role IN ('admin', 'coach')
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles skater
    WHERE skater.id::text = split_part(name, '/', 2)
      AND skater.role = 'customer'
  )
);

DROP POLICY IF EXISTS "Coaches delete skater avatar files" ON storage.objects;
CREATE POLICY "Coaches delete skater avatar files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles coach
    WHERE coach.id = auth.uid()
      AND coach.role IN ('admin', 'coach')
  )
  AND EXISTS (
    SELECT 1 FROM profiles skater
    WHERE skater.id::text = split_part(name, '/', 2)
      AND skater.role = 'customer'
  )
);
