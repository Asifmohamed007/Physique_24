// App shell: auth guard, shared state, navigation and hash router.
import { sb } from './core/supabase.js';
import { isConfigured } from './core/config.js';
import * as api from './core/api.js';
import { initSync, onStatus, pendingCount, flush, isNetworkError, isAuthError } from './core/sync.js';
import { $, esc, icon, refreshIcons, footerHTML, errorBox, loading, toast } from './core/ui.js';
import { installImageFallback } from './core/media.js';
import { todayISO } from './logic/dates.js';

// ---------------- shared state ----------------
export const app = {
  user: null, profile: null, settings: null,
  templates: [], templatesById: {}, schedule: [], overrides: [],
  exercises: [], exBySlug: {}, exById: {},
  tz() { return this.profile?.timezone || 'Asia/Qatar'; },
  today() { return todayISO(this.tz()); },
  unit() { return this.settings?.weight_unit || 'kg'; },
  planCtx() { return { scheduleRows: this.schedule, templatesById: this.templatesById, overrides: this.overrides }; },
  async reload(...keys) {
    const all = !keys.length;
    const jobs = [];
    if (all || keys.includes('profile')) jobs.push(api.loadProfile().then((r) => { this.profile = r.profile; this.settings = r.settings; applyPrefs(); }));
    if (all || keys.includes('templates')) jobs.push(api.loadTemplates().then((t) => { this.templates = t; this.templatesById = Object.fromEntries(t.map((x) => [x.id, x])); }));
    if (all || keys.includes('schedule')) jobs.push(api.loadSchedule().then((s) => { this.schedule = s; }));
    if (all || keys.includes('overrides')) jobs.push(api.loadOverrides().then((o) => { this.overrides = o; }));
    if (all || keys.includes('exercises')) jobs.push(api.loadExercises().then((e) => {
      this.exercises = e; this.exBySlug = Object.fromEntries(e.map((x) => [x.slug, x])); this.exById = Object.fromEntries(e.map((x) => [x.id, x]));
    }));
    await Promise.all(jobs);
  },
};
window.__app = app; // handy for debugging in the console

function applyPrefs() {
  document.documentElement.dataset.motion = app.settings?.reduced_motion ? 'reduced' : '';
}

// ---------------- routes ----------------
const ROUTES = {
  dashboard: { title: 'Dashboard', load: () => import('./pages/dashboard.js'), nav: 'dashboard' },
  workout: { title: "Today's Workout", load: () => import('./pages/today.js'), nav: 'workout' },
  active: { title: 'Active Workout', load: () => import('./pages/active.js'), nav: 'workout' },
  library: { title: 'Exercise Library', load: () => import('./pages/library.js'), nav: 'library' },
  nutrition: { title: 'Nutrition', load: () => import('./pages/nutrition.js'), nav: 'nutrition' },
  progress: { title: 'Progress', load: () => import('./pages/progress.js'), nav: 'progress' },
  measurements: { title: 'Body Measurements', load: () => import('./pages/measurements.js'), nav: 'progress' },
  photos: { title: 'Progress Photos', load: () => import('./pages/photos.js'), nav: 'progress' },
  streaks: { title: 'Streaks & Achievements', load: () => import('./pages/streaks.js'), nav: 'progress' },
  timeline: { title: '24-Week Program', load: () => import('./pages/timeline.js'), nav: 'progress' },
  history: { title: 'Workout History', load: () => import('./pages/history.js'), nav: 'progress' },
  settings: { title: 'Profile & Settings', load: () => import('./pages/settings.js'), nav: 'settings' },
  privacy: { title: 'Export & Privacy', load: () => import('./pages/privacy.js'), nav: 'settings' },
};

const NAV = [
  ['dashboard', 'layout-dashboard', 'Dashboard', 'Home'],
  ['workout', 'dumbbell', 'Workout', 'Workout'],
  ['library', 'library', 'Exercise Library', 'Library'],
  ['nutrition', 'utensils', 'Nutrition', 'Food'],
  ['progress', 'trending-up', 'Progress', 'Progress'],
  ['settings', 'user-round', 'Profile & Settings', 'Profile'],
];
const PROGRESS_SUB = [['progress', 'Charts'], ['measurements', 'Measurements'], ['photos', 'Photos'], ['streaks', 'Streaks'], ['timeline', 'Program'], ['history', 'History']];
const SETTINGS_SUB = [['settings', 'Profile & schedule'], ['privacy', 'Export & privacy']];

export function subnav(current, group = 'progress') {
  const items = group === 'progress' ? PROGRESS_SUB : SETTINGS_SUB;
  return `<nav class="subnav" aria-label="Section">${items.map(([r, l]) =>
    `<a href="#/${r}" ${r === current ? 'aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
}

function shellHTML() {
  return `
  <div class="shell">
    <aside class="sidebar" aria-label="Main">
      <a class="brand" href="#/dashboard"><span class="brand-mark">A</span><span><b>Physique 24</b><span>6-month tracker</span></span></a>
      ${NAV.map(([r, i, l]) => `<a class="nav-link" data-nav="${r}" href="#/${r}">${icon(i)}<span>${l}</span></a>`).join('')}
      <div class="nav-sep"></div>
      ${['history', 'streaks', 'timeline', 'measurements', 'photos', 'privacy'].map((r) =>
        `<a class="nav-link sub" data-sub="${r}" href="#/${r}">${icon({ history: 'history', streaks: 'flame', timeline: 'calendar-range', measurements: 'ruler', photos: 'images', privacy: 'shield-check' }[r])}<span>${ROUTES[r].title}</span></a>`).join('')}
      <div style="margin-top:auto"></div>
      <button class="nav-link" id="signout" style="background:none;border:0;cursor:pointer;font:inherit">${icon('log-out')}<span>Sign out</span></button>
    </aside>
    <div class="main">
      <header class="topbar">
        <h1 id="page-title">Dashboard</h1>
        <span class="save-pill" id="save-pill" data-status="idle" role="status" aria-live="polite">Ready</span>
      </header>
      <main id="view" class="page" tabindex="-1"></main>
      ${footerHTML()}
    </div>
  </div>
  <nav class="bottom-nav" aria-label="Main">
    ${NAV.map(([r, i, , short]) => `<a data-nav="${r}" href="#/${r}">${icon(i)}<span>${short}</span></a>`).join('')}
  </nav>`;
}

let cleanup = null;
async function route() {
  const [name = 'dashboard', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES[name] || ROUTES.dashboard;
  const key = ROUTES[name] ? name : 'dashboard';
  document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav !== r.nav) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'page'); });
  document.querySelectorAll('[data-sub]').forEach((a) => { if (a.dataset.sub === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#page-title').textContent = r.title;
  document.title = `${r.title} · Physique 24`;
  // fresh element per page so event listeners never pile up between renders
  const old = $('#view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  view.innerHTML = loading();
  try {
    const mod = await r.load();
    cleanup = await mod.render(view, params, key);
    refreshIcons(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = errorBox(err);
    view.querySelector('[data-action="reload"]')?.addEventListener('click', route);
    refreshIcons(view);
  }
  window.scrollTo({ top: 0 });
}
export const rerender = route;

function bindSaveStatus() {
  const pill = $('#save-pill');
  onStatus((s) => {
    pill.dataset.status = s.status;
    const text = { idle: 'Ready', saving: 'Saving…', saved: 'Saved', offline: s.message || 'Offline', error: 'Not saved', auth: 'Sign in again' }[s.status] || s.status;
    pill.textContent = s.pending && s.status !== 'saving' ? `${text} · ${s.pending} waiting` : text;
    pill.title = s.message || text;
    if (s.status === 'error') toast(s.message, 'error', 5000);
    if (s.status === 'auth') toast(s.message, 'error', 6000);
  });
}

function libFailScreen() {
  document.body.innerHTML = `<main class="page" style="max-width:560px;margin:40px auto;text-align:center">
    <h1>Couldn't connect</h1>
    <p class="muted">The app files didn't finish loading — usually a weak signal. It will retry automatically when you're back online.</p>
    <button class="btn btn-primary" onclick="location.reload()">Try again</button>
  </main>${footerHTML()}`;
  window.addEventListener('online', () => location.reload(), { once: true });
  setTimeout(() => { if (navigator.onLine) location.reload(); }, 8000);
}

/** Retry a load a few times with growing waits, showing progress, before giving up. */
async function withRetry(fn, onWait) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (!isNetworkError(err) && !isAuthError(err)) throw err;
      if (isAuthError(err)) await sb.auth.refreshSession().catch(() => {});
      onWait?.(attempt + 1);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function setupScreen() {
  document.body.innerHTML = `<main class="page" style="max-width:640px;margin:40px auto">
    <h1>Connect your database</h1>
    <p class="muted">The app needs your Supabase project details before it can store anything.</p>
    <div class="notice">Copy <code>assets/js/env.example.js</code> to <code>assets/js/env.js</code>, paste your Supabase project URL and anon public key, then reload. See README step 3.</div>
  </main>${footerHTML()}`;
}

// ---------------- boot ----------------
async function boot() {
  if (!isConfigured) return setupScreen();          // settings genuinely missing
  if (!window.supabase || !sb) return libFailScreen(); // library didn't load (connection), not a setup problem
  let { data } = await sb.auth.getSession();
  if (!data.session) {
    // an expired token is refreshed rather than treated as signed out
    const r = await sb.auth.refreshSession().catch(() => ({ data: {} }));
    data = r.data || {};
  }
  if (!data.session) { location.replace('login.html'); return; }
  app.user = data.session.user;
  api.setUser(app.user.id);

  document.body.innerHTML = shellHTML();
  refreshIcons();
  bindSaveStatus();
  initSync(app.user.id);
  installImageFallback((slug) => app.exBySlug[slug]);

  $('#signout').addEventListener('click', async () => {
    if (pendingCount() && !(await flush())) {
      if (!confirm('Some changes have not reached the server yet. Signing out keeps them on this device until you sign in again. Sign out anyway?')) return;
    }
    await sb.auth.signOut();
    location.replace('login.html');
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) location.replace('login.html');
    if (event === 'TOKEN_REFRESHED') flush();
  });

  $('#view').innerHTML = loading('Loading your plan');
  try {
    await withRetry(() => app.reload(), (n) => { $('#view').innerHTML = loading(`Reconnecting (try ${n} of 4)`); });
    if (!app.templates.length) { await api.ensureProgram(); await app.reload('templates', 'schedule'); }
  } catch (err) {
    $('#view').innerHTML = isNetworkError(err)
      ? errorBox({ message: 'No connection to the server right now. Anything you log on this phone is kept and sent when the signal is back. Reloading automatically once you are online.' })
      : errorBox(err);
    $('#view [data-action="reload"]')?.addEventListener('click', () => location.reload());
    window.addEventListener('online', () => location.reload(), { once: true });
    refreshIcons();
    return;
  }

  // Coming back to the app after a break: make sure the login is fresh and send anything queued.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      let { data: d } = await sb.auth.getSession();
      if (!d.session) d = (await sb.auth.refreshSession()).data || {};
      if (!d.session && navigator.onLine) { location.replace('login.html'); return; }
      flush();
    } catch { /* offline: the save queue retries on reconnect */ }
  });
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  route();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

window.addEventListener('beforeunload', (e) => {
  if (pendingCount()) { e.preventDefault(); e.returnValue = ''; }
});

boot();
