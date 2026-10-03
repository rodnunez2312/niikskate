-- Family accounts could not set a skater photo. Storage only allowed
-- avatars/{auth.uid()}, and a linked child's profiles row was not writable
-- by the parent. Crew photos live under avatars/crew/{id}, which matched neither.

DROP POLICY IF EXISTS "Family upload skater avatar files" ON storage.objects;
CREATE POLICY "Family upload skater avatar files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND (
    split_part(name, '/', 2) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles skater
      WHERE skater.id::text = split_part(name, '/', 2)
        AND skater.guardian_user_id = auth.uid()
    )
    OR (
      split_part(name, '/', 2) = 'crew'
      AND EXISTS (
        SELECT 1 FROM crew_members c
        WHERE c.id::text = split_part(name, '/', 3)
          AND c.guardian_user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Family update skater avatar files" ON storage.objects;
CREATE POLICY "Family update skater avatar files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND (
    split_part(name, '/', 2) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles skater
      WHERE skater.id::text = split_part(name, '/', 2)
        AND skater.guardian_user_id = auth.uid()
    )
    OR (
      split_part(name, '/', 2) = 'crew'
      AND EXISTS (
        SELECT 1 FROM crew_members c
        WHERE c.id::text = split_part(name, '/', 3)
          AND c.guardian_user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND (
    split_part(name, '/', 2) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles skater
      WHERE skater.id::text = split_part(name, '/', 2)
        AND skater.guardian_user_id = auth.uid()
    )
    OR (
      split_part(name, '/', 2) = 'crew'
      AND EXISTS (
        SELECT 1 FROM crew_members c
        WHERE c.id::text = split_part(name, '/', 3)
          AND c.guardian_user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Family delete skater avatar files" ON storage.objects;
CREATE POLICY "Family delete skater avatar files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND (
    split_part(name, '/', 2) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles skater
      WHERE skater.id::text = split_part(name, '/', 2)
        AND skater.guardian_user_id = auth.uid()
    )
    OR (
      split_part(name, '/', 2) = 'crew'
      AND EXISTS (
        SELECT 1 FROM crew_members c
        WHERE c.id::text = split_part(name, '/', 3)
          AND c.guardian_user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Guardians update linked skater profiles" ON profiles;
CREATE POLICY "Guardians update linked skater profiles"
  ON profiles FOR UPDATE TO authenticated
  USING (guardian_user_id = auth.uid())
  WITH CHECK (guardian_user_id = auth.uid());
