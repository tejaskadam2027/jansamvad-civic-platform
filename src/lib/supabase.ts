import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const missing = !url || !anonKey;

if (missing) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; Supabase features will be unavailable. Restart the dev server after adding them to .env.');
}

export const supabase: SupabaseClient = missing
  ? ({} as SupabaseClient)
  : createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
