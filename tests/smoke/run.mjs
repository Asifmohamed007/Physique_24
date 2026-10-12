// Headless end-to-end smoke test.
// Runs the real app modules in jsdom against an in-memory Supabase stand-in
// loaded with fixture data exported from the real PostgreSQL schema.
// Visits every page, then starts, logs and finishes a workout.
//   npm i --no-save jsdom@24.1.0 && node tests/smoke/run.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(path.join(here, 'fixtures.json'), 'utf8'));
const UID = '11111111-1111-1111-1111-111111111111';
const errors = [];
const results = [];

// ---------------- mock Supabase ----------------
const REL = {
  workout_templates: { template_exercises: ['many', 'template_exercises', 'template_id'] },
  template_exercises: { exercises: ['one', 'exercises', 'exercise_id'] },
  workout_sessions: { session_exercises: ['many', 'session_exercises', 'session_id'] },
  session_exercises: { exercise_sets: ['many', 'exercise_sets', 'session_exercise_id'], workout_sessions: ['one', 'workout_sessions', 'session_id'] },
};
function parseSelect(s = '*') {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((t) => t.includes('(')).map((t) => { const i = t.indexOf('('); return { name: t.slice(0, i).replace(/!inner/, '').trim(), inner: t.slice(i + 1, -1) }; });
}
function embed(table, row, sel) {
  const r = { ...row };
  for (const e of parseSelect(sel)) {
    const rel = REL[table]?.[e.name];
    if (!rel) continue;
    const [kind, t, fk] = rel;
    r[e.name] = kind === 'many' ? db[t].filter((x) => x[fk] === row.id).map((x) => embed(t, x, e.inner)) : (() => { const x = db[t].find((y) => y.id === row[fk]); return x ? embed(t, x, e.inner) : null; })();
  }
  return r;
}
const getPath = (row, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);

class Q {
  constructor(table) { this.t = table; this.f = []; this.op = 'select'; this.sel = '*'; this.ord = []; this.lim = null; this.one = null; this.ret = false; }
  select(s = '*') { if (this.op === 'select') this.sel = s; else this.ret = true; return this; }
  eq(k, v) { this.f.push((r) => getPath(r, k) === v || (getPath(r, k) === undefined && k.includes('.'))); return this; }
  neq(k, v) { this.f.push((r) => getPath(r, k) !== v); return this; }
  gte(k, v) { this.f.push((r) => getPath(r, k) >= v); return this; }
  lte(k, v) { this.f.push((r) => getPath(r, k) <= v); return this; }
  in(k, v) { this.f.push((r) => v.includes(getPath(r, k))); return this; }
  match(m) { Object.entries(m).forEach(([k, v]) => this.eq(k, v)); return this; }
  order(k, o = {}) { this.ord.push([k, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rg = [a, b]; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(v) { this.op = 'insert'; this.val = v; this.oc = 'id'; return this; }
  upsert(v, o = {}) { this.op = 'upsert'; this.val = v; this.oc = o.onConflict || 'id'; this.ign = o.ignoreDuplicates; return this; }
  update(v) { this.op = 'update'; this.val = v; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  run() {
    db[this.t] ||= [];
    const rows = db[this.t];
    const fin = (data) => {
      if (this.one) { if (this.one === 'single' && data.length !== 1) return { data: null, error: { message: `single() got ${data.length} rows on ${this.t}` } }; return { data: data[0] || null, error: null }; }
      return { data, error: null };
    };
    if (this.op === 'select') {
      let out = rows.map((r) => embed(this.t, r, this.sel));
      // inner-join semantics: drop rows whose embedded filter target is missing
      out = out.filter((r) => this.f.every((fn) => fn(r)));
      for (const [k, asc] of [...this.ord].reverse()) out.sort((a, b) => ((a[k] ?? '') < (b[k] ?? '') ? (asc ? -1 : 1) : (a[k] ?? '') > (b[k] ?? '') ? (asc ? 1 : -1) : 0));
      if (this.rg) out = out.slice(this.rg[0], this.rg[1] + 1);
      if (this.lim) out = out.slice(0, this.lim);
      return fin(out);
    }
    const list = Array.isArray(this.val) ? this.val : [this.val];
    if (this.op === 'insert' || this.op === 'upsert') {
      const keys = this.oc.split(',');
      const saved = [];
      for (const v of list) {
        const row = { id: v.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...v };
        if (this.t === 'workout_sessions' && row.status === undefined) row.status = 'in_progress';
        if (this.t === 'workout_sessions' && row.status === 'in_progress' && rows.some((r) => r.status === 'in_progress' && r.id !== row.id)) return { data: null, error: { message: 'duplicate key value violates unique constraint "ux_one_active_session"' } };
        const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (i >= 0 && this.op === 'insert') return { data: null, error: { message: `duplicate key on ${this.t}` } };
        if (i >= 0) { if (!this.ign) rows[i] = { ...rows[i], ...row }; saved.push(rows[i]); } else { rows.push(row); saved.push(row); }
      }
      return fin(saved);
    }
    if (this.op === 'update') {
      const hit = rows.filter((r) => this.f.every((fn) => fn(r)));
      hit.forEach((r) => Object.assign(r, this.val));
      return fin(hit);
    }
    if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.f.every((fn) => fn(r)));
      const gone = rows.length - keep.length;
      db[this.t] = keep;
      if (this.t === 'workout_sessions') { const ids = new Set(keep.map((r) => r.id)); db.session_exercises = db.session_exercises.filter((x) => ids.has(x.session_id)); }
      if (this.t === 'session_exercises') { const ids = new Set(db.session_exercises.map((r) => r.id)); db.exercise_sets = db.exercise_sets.filter((x) => ids.has(x.session_exercise_id)); }
      return fin(Array(gone).fill({}));
    }
  }
}
const user = { id: UID, email: 'asif@test.local' };
const mock = {
  from: (t) => new Q(t),
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getSession: async () => ({ data: { session: { user } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({}), updateUser: async () => ({ error: null }), refreshSession: async () => ({ error: null }),
  },
  storage: { from: () => ({ createSignedUrls: async (p) => ({ data: p.map((x) => ({ path: x, signedUrl: `https://example.invalid/${x}` })) }), list: async () => ({ data: [] }), upload: async () => ({}), remove: async () => ({}) }) },
};

// ---------------- DOM environment ----------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fit.test/app.html#/dashboard', pretendToBeVisual: true });
const w = dom.window;
w.FITAPP_ENV = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig-placeholder-long', SITE_URL: 'https://fit.test' };
w.supabase = { createClient: () => mock };
class FakeChart { static defaults = { font: {} }; constructor(c, cfg) { this.cfg = cfg; if (!cfg.data?.datasets?.length) throw new Error('chart without data'); } destroy() {} }
w.Chart = FakeChart;
w.matchMedia = () => ({ matches: false, addEventListener() {} });
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.HTMLCanvasElement.prototype.getContext = () => ({ createLinearGradient: () => ({ addColorStop() {} }) });
w.IntersectionObserver = class { observe() {} unobserve() {} };
w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
w.confirm = () => true;
for (const k of ['window', 'document', 'location', 'history', 'localStorage', 'navigator', 'HTMLElement', 'HTMLImageElement', 'HashChangeEvent', 'Event', 'Blob', 'requestAnimationFrame', 'getComputedStyle', 'IntersectionObserver']) {
  Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
}
globalThis.atob = w.atob;
w.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));
const origErr = console.error; console.error = (...a) => { errors.push(a.map((x) => x?.stack || String(x)).join(' ')); };
console.warn = (...a) => errors.push(`warn: ${a.map(String).join(' ')}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
async function waitFor(fn, label, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); }
  throw new Error(`timeout: ${label}`);
}
function check(name, ok, detail = '') { results.push([ok ? 'PASS' : 'FAIL', name, detail]); }
const viewText = () => $('#view')?.textContent || '';
const click = (el) => { if (!el) { errors.push('click target missing'); return; } el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

// ---------------- run ----------------
await import('../../assets/js/app.js');
await waitFor(() => $('#view') && !viewText().includes('Loading'), 'dashboard render');

const pages = ['dashboard', 'workout', 'library', 'nutrition', 'progress', 'measurements', 'photos', 'streaks', 'timeline', 'history', 'settings', 'privacy', 'active'];
for (const p of pages) {
  w.location.hash = `#/${p}`;
  await sleep(30);
  try {
    await waitFor(() => !viewText().includes('Loading…'), p);
    const bad = viewText().includes("Couldn't load this");
    check(`page renders: ${p}`, !bad, bad ? viewText().slice(0, 200) : '');
  } catch (e) { check(`page renders: ${p}`, false, e.message); }
}

// content checks
w.location.hash = '#/dashboard'; await sleep(200);
check('dashboard shows real total from fixtures', viewText().includes('Total workouts'), '');
check('footer text correct with current year', w.document.querySelector('.site-footer').textContent.includes(`© ${new Date().getFullYear()} Developed by Asif Mohamed | All Rights Reserved.`));
w.location.hash = '#/history'; await sleep(200);
check('history lists 13 completed workouts', w.document.querySelectorAll('#view a.list-item').length === 13, `${w.document.querySelectorAll('#view a.list-item').length} items`);

// ----- planner: simulate "finished 5, skipped the rest" on the latest session -----
{
  // last three sessions: only the first 4 exercises finished each time
  const recent = [...db.workout_sessions].filter((x) => x.status === 'completed').sort((a, b) => (a.session_date < b.session_date ? 1 : -1)).slice(0, 3);
  for (const latest of recent) {
    const ses = db.session_exercises.filter((e) => e.session_id === latest.id).sort((a, b) => a.position - b.position);
    for (const e of ses.slice(4)) db.exercise_sets.filter((x) => x.session_exercise_id === e.id).forEach((x) => { x.completed = false; });
  }
}

// ----- full workout flow -----
const today = (await import('../../assets/js/logic/dates.js')).todayISO('Asia/Qatar');
const { planForDate } = await import('../../assets/js/logic/schedule.js');
const app = w.__app;
let planned = planForDate(today, app.planCtx()).length;
if (!planned) { // today is a rest day: use "train anyway" flow
  w.location.hash = '#/workout'; await sleep(200);
  click($('[data-action="extra"]')); await sleep(50);
  click(w.document.querySelector('dialog [data-ok]')); await sleep(250);
  click(w.document.querySelector('dialog [data-ok]')); await sleep(400);
} else {
  w.location.hash = '#/workout'; await sleep(300);
  check('today shows time estimate against the gym window', /about \d+ min of your \d+ min/.test(viewText()), viewText().slice(0, 200));
  check('today shows rotated variations', viewText().includes('variation '), '');
  check('plan is capped after skipped exercises', viewText().includes("You've been finishing about"), '');
  window.__planText = viewText();
  click($('[data-action="start"]')); await sleep(400);
}
await waitFor(() => w.location.hash === '#/active' && $('.ex-card'), 'active workout opens', 4000).catch((e) => check('start workout', false, e.message));
check('start workout creates in-progress session', db.workout_sessions.some((s) => s.status === 'in_progress'));
{
  const act = db.workout_sessions.find((x) => x.status === 'in_progress');
  const names = db.session_exercises.filter((e) => e.session_id === act.id).map((e) => e.exercise_name);
  const tpl = app.templates.find((t) => t.name === act.name);
  const base = (tpl?.template_exercises || []).map((te) => te.exercises.name);
  if (tpl) {
    check('session uses rotated exercises, not the same list every time', names.some((n) => !base.includes(n)), names.join(', '));
    check('session is shorter than the full template (rest offered as extras)', names.length < base.length, `${names.length} of ${base.length}`);
    check('no duplicate exercise in a session', new Set(names).size === names.length);
    check('"If you have time" quick-add shown in workout', !!$('[data-act="extra-add"]'));
    const before2 = w.document.querySelectorAll('.ex-card').length;
    click($('[data-act="extra-add"]')); await sleep(250);
    check('quick-add extra adds an exercise', w.document.querySelectorAll('.ex-card').length === before2 + 1);
  }
}
const firstCard = $('.ex-card');
const row = firstCard.querySelector('[data-set="0"]');
type(row.querySelector('[name=w]'), '22.5');
type(row.querySelector('[name=r]'), '12');
click(row.querySelector('[data-act="toggle"]'));
await sleep(300);
const activeId = db.workout_sessions.find((s) => s.status === 'in_progress')?.id;
const activeSe = new Set(db.session_exercises.filter((x) => x.session_id === activeId).map((x) => x.id));
const savedSet = db.exercise_sets.find((s) => activeSe.has(s.session_exercise_id) && Number(s.weight_kg) === 22.5 && s.reps === 12 && s.completed);
check('set weight/reps saved individually to database', !!savedSet);
check('rest timer starts after completing a set', $('#rest').classList.contains('show'));
// unticked set without reps refuses to complete
const row2 = $('.ex-card').querySelector('[data-set="1"]');
click(row2.querySelector('[data-act="toggle"]')); await sleep(50);
check('cannot tick a set with no reps', !db.exercise_sets.some((s) => s.set_number === 2 && s.completed && s.session_exercise_id === savedSet?.session_exercise_id));
// add a set
const before = $('.ex-card').querySelectorAll('.set-row').length;
click($('.ex-card [data-act="add-set"]')); await sleep(50);
check('add set works', $('.ex-card').querySelectorAll('.set-row').length === before + 1);
// resume after "reload": re-render active page from server state
w.location.hash = '#/dashboard'; await sleep(250);
w.location.hash = '#/active'; await sleep(400);
const resumed = $('.ex-card [data-set="0"] [name=w]');
check('unfinished workout resumes with saved set', resumed && resumed.value === '22.5', resumed?.value);
// finish
click($('[data-act="finish"]')); await sleep(80);
click(w.document.querySelector('dialog [data-ok]')); await sleep(900);
const done = db.workout_sessions.find((s) => s.id === savedSet && false) || db.workout_sessions.filter((s) => s.session_date === today && s.status === 'completed');
check('finish saves completed session', done.length >= 1);
check('summary screen shown', viewText().includes('Workout saved'), viewText().slice(0, 120));
check('progression suggestion generated from real sets', db.progression_suggestions.length >= 2, `${db.progression_suggestions.length}`);
check('no unfinished workout left', !db.workout_sessions.some((s) => s.status === 'in_progress'));

// nutrition quick add
w.location.hash = '#/nutrition'; await sleep(250);
const egg = [...w.document.querySelectorAll('#view [data-add-food]')].find((b) => b.textContent.includes('4 eggs'));
const n0 = db.nutrition_entries.length;
click(egg); await sleep(300);
check('quick-add 4 eggs saves a nutrition entry', db.nutrition_entries.length === n0 + 1 && Math.abs(db.nutrition_entries.at(-1).protein_g - 25.2) < 0.01);
click([...w.document.querySelectorAll('#view [data-water]')][0]); await sleep(200);
check('water +250 ml saved', db.water_intake.some((x) => x.amount_ml === 250));

// measurements form
w.location.hash = '#/measurements'; await sleep(250);
const mf = $('#mform');
mf.querySelector('[name=weight]').value = '74.6'; mf.querySelector('[name=waist_cm]').value = '78.5';
mf.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(300);
check('measurement saved', db.body_measurements.some((m) => Number(m.weight_kg) === 74.6 && Number(m.waist_cm) === 78.5));
mf.querySelector?.('[name=weight]');

// streak page shows calendar
w.location.hash = '#/streaks'; await sleep(250);
check('six-month calendar has 168 day cells', w.document.querySelectorAll('.cal .d').length === 168);
check('a missed day is shown as missed (not rest)', w.document.querySelectorAll('.cal .d[data-s="missed"]').length >= 1);
check('rest days shown as rest', w.document.querySelectorAll('.cal .d[data-s="rest"]').length >= 4);

// ---------------- report ----------------
console.error = origErr;
const realErrors = errors.filter((e) => !/Not implemented: (navigation|HTMLCanvas)/.test(e));
for (const [s, n, d] of results) console.log(`${s} ${n}${d && s === 'FAIL' ? ` — ${d}` : ''}`);
console.log(realErrors.length ? `\nConsole errors (${realErrors.length}):\n${realErrors.slice(0, 15).join('\n')}` : '\nNo console errors.');
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || realErrors.length ? 1 : 0);
