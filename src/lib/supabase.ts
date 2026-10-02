import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

// Standard anonymous/public client
// detectSessionInUrl off everywhere: this app reads auth fragments itself
// (/reset-password, /email-confirmed). Left on, supabase-js clears
// window.location.hash on load, racing the reset page for its own link.
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Creates a Supabase client that uses the authenticated user's token.
 * This is useful for making queries on behalf of the user to enforce RLS.
 */
export function createAuthedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
