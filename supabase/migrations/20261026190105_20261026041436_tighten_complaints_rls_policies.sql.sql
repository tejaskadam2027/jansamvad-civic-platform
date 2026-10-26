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