// Service worker: makes the app open offline and load fast.
// It NEVER caches Supabase API, auth or storage traffic — your data always
// comes from (and goes to) the database. Offline writes are queued by the app.
const VERSION = 'p24-v1.1.0';
const SHELL = [
  './', 'index.html', 'app.html', 'login.html', 'manifest.json',
  'assets/css/app.css', 'assets/css/landing.css',
  'assets/js/app.js', 'assets/js/login.js', 'assets/js/landing.js',
  'assets/js/core/api.js', 'assets/js/core/charts.js', 'assets/js/core/config.js', 'assets/js/core/media.js',
  'assets/js/core/supabase.js', 'assets/js/core/sync.js', 'assets/js/core/ui.js',
  'assets/js/logic/dates.js', 'assets/js/logic/nutrition.js', 'assets/js/logic/program.js', 'assets/js/logic/progression.js',
  'assets/js/logic/records.js', 'assets/js/logic/schedule.js', 'assets/js/logic/streaks.js', 'assets/js/logic/units.js',
  'assets/js/pages/active.js', 'assets/js/pages/dashboard.js', 'assets/js/pages/history.js', 'assets/js/pages/library.js',
  'assets/js/pages/measurements.js', 'assets/js/pages/nutrition.js', 'assets/js/pages/photos.js', 'assets/js/pages/privacy.js',
  'assets/js/pages/progress.js', 'assets/js/pages/settings.js', 'assets/js/pages/streaks.js', 'assets/js/pages/timeline.js',
  'assets/js/pages/today.js', 'assets/js/pages/plan.js', 'assets/js/logic/planner.js',
  'assets/vendor/supabase.js', 'assets/vendor/chart.umd.js', 'assets/vendor/lucide.min.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png',
];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.pathname.includes('/auth/') || url.pathname.includes('/rest/') || url.pathname.includes('/storage/')) return;
  if (url.pathname.endsWith('/env.js')) return; // config always fresh

  // Pinned CDN libraries and fonts: cache first (versioned URLs never change)
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;

  // Same-origin: network first so updates arrive, cache as offline fallback
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('app.html') : Response.error()))));
});
