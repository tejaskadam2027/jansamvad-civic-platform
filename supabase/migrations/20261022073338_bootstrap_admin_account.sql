/*
# Bootstrap admin account

Creates a default admin user in auth.users and profiles so the Admin
dashboard is functional immediately. The admin can approve/reject
privileged role signups.

Admin credentials:
  Email: admin@jansamvad.gov.in
  Password: Admin@12345

If the admin already exists, this migration is a no-op.
*/

DO $$
BEGIN
  -- Check if admin profile already exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE email = 'admin@jansamvad.gov.in') THEN
    -- Create auth user if not exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@jansamvad.gov.in') THEN
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        email_confirmed_at,
        encrypted_password,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        confirmation_token,
        email_change,
        email_change_token_new,
        email_change_token_current,
        recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'admin@jansamvad.gov.in',
        now(),
        crypt('Admin@12345', gen_salt('bf')),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        '',
        '',
        '',
        '',
        ''
      );
    END IF;

    -- Insert admin profile
    INSERT INTO profiles (id, email, full_name, mobile_number, role, access_status)
    SELECT u.id, u.email, 'System Admin', '9000000000', 'ADMIN', 'APPROVED'
    FROM auth.users u
    WHERE u.email = 'admin@jansamvad.gov.in';
  END IF;
END $$;
