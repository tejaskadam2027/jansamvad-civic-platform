/*
# Create profiles table and bootstrap admin account

1. New Tables
- `profiles`: stores user profile data linked to Supabase Auth users.
  - `id` (uuid, primary key, references auth.users) — the auth user's id.
  - `email` (text, unique, not null) — the user's email.
  - `full_name` (text, not null) — the user's display name.
  - `mobile_number` (text) — the user's phone number.
  - `role` (text, not null, default 'CITIZEN') — one of CITIZEN, MUNICIPAL_AUTHORITY, FIELD_WORKFORCE, INFLUENCER_REPORTER, ADMIN.
  - `access_status` (text, not null, default 'APPROVED') — one of APPROVED, PENDING, REJECTED. Privileged roles start as PENDING until an admin approves them.
  - `requested_role` (text, nullable) — the role a pending user originally requested.
  - `ward` (text, nullable) — the user's ward/area.
  - `department` (text, nullable) — the department a municipal authority or field worker belongs to.
  - `created_at` (timestamptz, default now()).
2. Security
- Enable RLS on `profiles`.
- Grant SELECT, INSERT, UPDATE, DELETE to `authenticated` (sign-in app).
- Users can SELECT/UPDATE their own profile row (auth.uid() = id).
- INSERT is allowed for the authenticated owner (auth.uid() = id) — used during signup after the auth user is created.
- DELETE is allowed for the owner.
- service_role is granted all verbs for admin/edge-function operations.
3. Bootstrap admin
- Creates a default ADMIN user in auth.users and a matching APPROVED profile so the Admin dashboard is functional immediately.
  Email: admin@jansamvad.gov.in
  Password: Admin@12345
- Idempotent: no-op if the admin already exists.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  mobile_number text,
  role text NOT NULL DEFAULT 'CITIZEN',
  access_status text NOT NULL DEFAULT 'APPROVED',
  requested_role text,
  ward text,
  department text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO service_role;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile"
ON profiles FOR DELETE
TO authenticated USING (auth.uid() = id);

-- Bootstrap admin account (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE email = 'admin@jansamvad.gov.in') THEN
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

    INSERT INTO profiles (id, email, full_name, mobile_number, role, access_status)
    SELECT u.id, u.email, 'System Admin', '9000000000', 'ADMIN', 'APPROVED'
    FROM auth.users u
    WHERE u.email = 'admin@jansamvad.gov.in';
  END IF;
END $$;