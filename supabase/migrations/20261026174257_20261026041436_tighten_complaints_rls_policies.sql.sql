/*
# Tighten complaints RLS policies with role-based access control

1. New Functions
- `is_authority_or_admin()`: SECURITY DEFINER helper that returns true if the current
  authenticated user's profile role is MUNICIPAL_AUTHORITY or ADMIN. Used by complaints
  RLS policies so only authority/admin roles can read or update ALL complaints.
2. Security Changes
- DROP the old broad `select_complaints` policy (USING true — visible to everyone).
- DROP the old broad `update_complaints` policy (USING true / WITH CHECK true).
- CREATE `select_complaints_role_based`: role-scoped SELECT.
- CREATE `update_complaints_role_based`: role-scoped UPDATE.
- INSERT and DELETE policies remain owner-only (citizen_id = auth.uid()).
3. Notes
- This is a policy-only migration — no table structure changes, no data loss.
*/

CREATE OR REPLACE FUNCTION is_authority_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('MUNICIPAL_AUTHORITY', 'ADMIN')
  );
$$;

REVOKE EXECUTE ON FUNCTION is_authority_or_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_authority_or_admin() TO authenticated;

DROP POLICY IF EXISTS "select_complaints" ON complaints;
CREATE POLICY "select_complaints_role_based"
ON complaints FOR SELECT
TO authenticated USING (
  auth.uid() = citizen_id
  OR is_authority_or_admin()
  OR assigned_worker_id = auth.uid()::text
);

DROP POLICY IF EXISTS "update_complaints" ON complaints;
CREATE POLICY "update_complaints_role_based"
ON complaints FOR UPDATE
TO authenticated USING (
  auth.uid() = citizen_id
  OR is_authority_or_admin()
  OR assigned_worker_id = auth.uid()::text
) WITH CHECK (
  auth.uid() = citizen_id
  OR is_authority_or_admin()
  OR assigned_worker_id = auth.uid()::text
);
