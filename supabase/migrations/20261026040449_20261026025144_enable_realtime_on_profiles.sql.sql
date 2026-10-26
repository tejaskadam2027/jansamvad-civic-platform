/*
# Enable Supabase Realtime on profiles

1. Changes
- Adds the `profiles` table to the `supabase_realtime` publication so that INSERT/UPDATE/DELETE events on profiles are broadcast to subscribed clients.
2. Security
- No RLS changes. Realtime respects RLS: clients only receive events for rows they are allowed to see.
3. Idempotent
- `ALTER PUBLICATION ... ADD TABLE` is safe to re-run; if already present, it is a no-op.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
