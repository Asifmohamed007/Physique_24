import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export const sb = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
