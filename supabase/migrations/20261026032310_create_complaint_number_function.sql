/*
# Create next_complaint_number() function

1. New Functions
- `next_complaint_number()`: SECURITY DEFINER function that atomically returns the next complaint number in the format `JS-2026-NNNNNN` using a sequence. Safe to call concurrently.
2. Security
- SECURITY DEFINER so it can use the sequence; revoked from PUBLIC/anon, granted to authenticated (citizens create complaints).
*/

CREATE SEQUENCE IF NOT EXISTS complaint_number_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_complaint_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'JS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('complaint_number_seq')::text, 6, '0');
$$;

REVOKE EXECUTE ON FUNCTION next_complaint_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_complaint_number() TO authenticated;
GRANT USAGE ON SEQUENCE complaint_number_seq TO authenticated;
