/*
# Create admin access-request RPC functions

1. New Functions
- `get_pending_access_requests()`: SECURITY DEFINER function that returns all profiles whose `access_status = 'PENDING'`. Only callable by authenticated users whose own profile has `role = 'ADMIN'`; other callers get an error.
- `approve_access_request(target_uuid uuid)`: SECURITY DEFINER function that sets a target profile's `access_status` to 'APPROVED' and promotes its `role` to its `requested_role` (if set), then clears `requested_role`. Only callable by an ADMIN.
- `reject_access_request(target_uuid uuid)`: SECURITY DEFINER function that sets a target profile's `access_status` to 'REJECTED' and clears `requested_role`. Only callable by an ADMIN.
2. Security
- All three are SECURITY DEFINER so they can read/update any profile row, bypassing RLS, while the caller is still authenticated.
- Each function checks the caller's own profile role = 'ADMIN' and raises an exception otherwise, so only admins can list/approve/reject access requests.
- EXECUTE is revoked from PUBLIC and anon, granted only to authenticated (the admin is an authenticated user).
3. Notes
- `target_uuid` parameter name matches the frontend (`{ target_uuid: userId }`).
*/

CREATE OR REPLACE FUNCTION get_pending_access_requests()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  mobile_number text,
  user_role text,
  requested_role text,
  access_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT p.role INTO caller_role FROM profiles p WHERE p.id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can view access requests';
  END IF;

  RETURN QUERY
  SELECT
    profiles.id,
    profiles.full_name,
    profiles.email,
    profiles.mobile_number,
    profiles.role AS user_role,
    profiles.requested_role,
    profiles.access_status,
    profiles.created_at
  FROM profiles
  WHERE profiles.access_status = 'PENDING'
  ORDER BY profiles.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION approve_access_request(target_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  new_role text;
BEGIN
  SELECT p.role INTO caller_role FROM profiles p WHERE p.id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can approve access requests';
  END IF;

  SELECT p.requested_role INTO new_role FROM profiles p WHERE p.id = target_uuid;
  IF new_role IS NULL THEN
    UPDATE profiles SET access_status = 'APPROVED' WHERE id = target_uuid;
  ELSE
    UPDATE profiles
    SET access_status = 'APPROVED', role = new_role, requested_role = NULL
    WHERE id = target_uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_access_request(target_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT p.role INTO caller_role FROM profiles p WHERE p.id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can reject access requests';
  END IF;

  UPDATE profiles SET access_status = 'REJECTED', requested_role = NULL WHERE id = target_uuid;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_pending_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_pending_access_requests() TO authenticated;

REVOKE EXECUTE ON FUNCTION approve_access_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_access_request(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION reject_access_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reject_access_request(uuid) TO authenticated;