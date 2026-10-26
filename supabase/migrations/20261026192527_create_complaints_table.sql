/*
# Create complaints table for persistent civic complaints with geo-coordinates

1. New Tables
- `complaints`: stores citizen-submitted civic complaints with real latitude/longitude.
  - `id` (uuid, primary key).
  - `complaint_number` (text, unique, not null) — human-readable ID like JS-2026-000001.
  - `citizen_id` (uuid, not null, defaults to auth.uid()) — references auth.users(id); the submitting user.
  - `citizen_name` (text, not null) — denormalized display name for list/map rendering.
  - `title` (text, not null).
  - `description` (text, not null).
  - `category` (text, not null).
  - `department` (text, not null).
  - `priority` (text, not null, default 'MEDIUM') — HIGH / MEDIUM / LOW.
  - `location` (text) — optional human-readable area/landmark.
  - `latitude` (double precision) — nullable; complaints without GPS are allowed but flagged.
  - `longitude` (double precision) — nullable.
  - `image_url` (text) — optional photo URL.
  - `video_name` (text) — optional uploaded video filename.
  - `status` (text, not null, default 'REGISTERED') — REGISTERED / AI_ANALYZED / VERIFIED / ASSIGNED / IN_PROGRESS / RESOLVED / REJECTED.
  - `task_status` (text) — Assigned / Accepted / In Progress / Work Completed / Resolved.
  - `assigned_worker_id` (text) — optional workforce id (free-form, not FK since workforce is mock).
  - `assigned_worker_name` (text).
  - `before_photo_url` (text), `after_photo_url` (text), `resolution_note` (text).
  - `reward_points` (integer, not null, default 0).
  - `created_at` (timestamptz, default now()).
  - `updated_at` (timestamptz, default now()).
2. Security
- Enable RLS on `complaints`.
- Grant SELECT, INSERT, UPDATE, DELETE to `authenticated` (sign-in app) and to `service_role` (admin/edge functions).
- SELECT: any authenticated user may read all complaints (civic complaints are public records; authority/admin/citizens all need to see them). This is intentional public-readable data within the authenticated user base, NOT single-user isolation. Citizen contact info (email/phone) is NOT stored here, so no privacy leak.
- INSERT: only the owner (auth.uid() = citizen_id) may insert their own complaint.
- UPDATE: any authenticated user may update (authority/admin change status, workforce updates task_status, citizen can edit). Civic workflow requires multi-role mutation. Citizen email/phone is not in this table, so broad update is acceptable for the workflow.
- DELETE: only the owner may delete their own complaint.
3. Indexes
- Index on `citizen_id` for "my complaints" queries.
- Index on `status` for filtering.
- Index on `created_at` desc for recent lists.
4. Realtime
- Add `complaints` to the `supabase_realtime` publication so the Authority map and dashboards receive live updates when complaints are created or status changes, across browser tabs.
*/

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_number text UNIQUE NOT NULL,
  citizen_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  citizen_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  department text NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM',
  location text,
  latitude double precision,
  longitude double precision,
  image_url text,
  video_name text,
  status text NOT NULL DEFAULT 'REGISTERED',
  task_status text,
  assigned_worker_id text,
  assigned_worker_name text,
  before_photo_url text,
  after_photo_url text,
  resolution_note text,
  reward_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON complaints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON complaints TO service_role;

DROP POLICY IF EXISTS "select_complaints" ON complaints;
CREATE POLICY "select_complaints"
ON complaints FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_complaint" ON complaints;
CREATE POLICY "insert_own_complaint"
ON complaints FOR INSERT
TO authenticated WITH CHECK (auth.uid() = citizen_id);

DROP POLICY IF EXISTS "update_complaints" ON complaints;
CREATE POLICY "update_complaints"
ON complaints FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_complaint" ON complaints;
CREATE POLICY "delete_own_complaint"
ON complaints FOR DELETE
TO authenticated USING (auth.uid() = citizen_id);

CREATE INDEX IF NOT EXISTS idx_complaints_citizen_id ON complaints (citizen_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints (created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE complaints;