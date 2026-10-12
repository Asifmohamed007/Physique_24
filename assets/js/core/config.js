const env = window.FITAPP_ENV || {};
export const SUPABASE_URL = (env.SUPABASE_URL || '').trim().replace(/\/(rest\/v1)?\/?$/, '');
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';
export const SITE_URL = (env.SITE_URL || location.origin).replace(/\/$/, '');
export const PHOTO_BUCKET = 'progress-photos';

export const isConfigured =
  /^https:\/\/[^/]+$/.test(SUPABASE_URL) && !SUPABASE_URL.includes("YOUR-") && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.startsWith('YOUR-');

// Guard against the most dangerous mistake: a service_role key in the browser.
let role = '';
try { role = JSON.parse(atob((SUPABASE_ANON_KEY.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { /* not a JWT */ }
if (role === 'service_role' || /^sb_secret_/.test(SUPABASE_ANON_KEY)) {
  document.documentElement.innerHTML = '<p style="font:16px system-ui;padding:2rem;color:#fff;background:#300">' +
    'Stopped: env.js contains a secret (service_role) key. Replace it with the anon / publishable key and rotate the secret key in Supabase.</p>';
  throw new Error('Secret key detected in browser config');
}
