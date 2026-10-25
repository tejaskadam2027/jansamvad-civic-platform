import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Check .env and restart the dev server.'
  );
}

export const supabase: SupabaseClient = createClient(
  (url as string) ?? 'https://placeholder.supabase.co',
  (anonKey as string) ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
