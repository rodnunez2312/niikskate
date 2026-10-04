-- Admins could not upload a skater photo: the storage insert only matched when
-- the folder id equalled a customer profile in the same letter case, and the
-- profile update check rejected some linked accounts.
-- Also: Sanchez Reyes skaters belong to Marina Reyes, not to Itza.

DROP POLICY IF EXISTS "Coaches upload skater avatar files" ON storage.objects;
CREATE POLICY "Coaches upload skater avatar files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles staff
    WHERE staff.id = auth.uid()
      AND staff.role IN ('admin', 'coach')
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
    SELECT 1 FROM profiles staff
    WHERE staff.id = auth.uid()
      AND staff.role IN ('admin', 'coach')
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND split_part(name, '/', 1) = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles staff
    WHERE staff.id = auth.uid()
      AND staff.role IN ('admin', 'coach')
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
    SELECT 1 FROM profiles staff
    WHERE staff.id = auth.uid()
      AND staff.role IN ('admin', 'coach')
  )
);

DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles staff WHERE staff.id = auth.uid() AND staff.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles staff WHERE staff.id = auth.uid() AND staff.role = 'admin')
  );

-- New family login only. marinarssanchez@gmail.com stays the admin account.
DO $$
DECLARE
  inst uuid;
  marina uuid;
  itza uuid;
  v_email text := 'marina.reyes@niikskate.com';
  v_password text := crypt('NiikTemp2026!', gen_salt('bf'));
BEGIN
  SELECT id INTO marina FROM profiles WHERE lower(email) = v_email LIMIT 1;

  IF marina IS NULL THEN
    SELECT instance_id INTO inst FROM auth.users LIMIT 1;
    IF inst IS NULL THEN
      RAISE EXCEPTION 'No auth.users row to copy instance_id from.';
    END IF;

    marina := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, email_change,
      email_change_token_new, recovery_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      marina, inst, 'authenticated', 'authenticated', v_email, v_password,
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Marina Reyes"}'::jsonb,
      now(), now()
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      marina,
      jsonb_build_object('sub', marina::text, 'email', v_email),
      'email',
      v_email,
      now(), now(), now()
    );
  END IF;

  UPDATE profiles
  SET email = v_email,
      full_name = 'Marina Reyes',
      first_name = 'Marina',
      last_name = 'Reyes',
      role = 'customer',
      customer_kind = 'guardian',
      guardian_user_id = NULL,
      is_active = true,
      updated_at = now()
  WHERE id = marina;

  SELECT id INTO itza
  FROM profiles
  WHERE lower(email) = 'itza.sanchez@niikskate.com'
    AND role = 'customer'
  LIMIT 1;

  UPDATE profiles
  SET customer_kind = 'skater',
      guardian_user_id = marina,
      updated_at = now()
  WHERE role = 'customer'
    AND id <> marina
    AND (
      lower(coalesce(email, '')) IN (
        'itza.sanchez@niikskate.com',
        'rodrigo.sanchez@niikskate.com',
        'rodrigo.sanchez@niikskate.co'
      )
      OR lower(coalesce(full_name, '')) LIKE '%rodrigo%sanchez%'
      OR lower(coalesce(full_name, '')) LIKE '%itza%sanchez%'
    );

  IF itza IS NOT NULL THEN
    UPDATE profiles
    SET guardian_user_id = marina,
        customer_kind = CASE WHEN id = itza THEN 'skater' ELSE customer_kind END,
        updated_at = now()
    WHERE guardian_user_id = itza
      AND id <> marina
      AND role = 'customer';

    UPDATE crew_members
    SET guardian_user_id = marina
    WHERE guardian_user_id = itza;
  END IF;
END $$;

SELECT p.email, p.full_name, p.role, p.customer_kind, tutor.email AS tutor_email
FROM profiles p
LEFT JOIN profiles tutor ON tutor.id = p.guardian_user_id
WHERE lower(p.email) IN (
    'marina.reyes@niikskate.com',
    'itza.sanchez@niikskate.com',
    'rodrigo.sanchez@niikskate.com',
    'rodrigo.sanchez@niikskate.co'
  )
  OR (
    p.role = 'customer'
    AND (
      lower(coalesce(p.full_name, '')) LIKE '%itza%sanchez%'
      OR lower(coalesce(p.full_name, '')) LIKE '%rodrigo%sanchez%'
    )
  )
ORDER BY p.customer_kind, p.full_name;
