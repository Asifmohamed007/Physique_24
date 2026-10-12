// Boot behaviour when things go wrong: missing settings vs. a library that failed to load.
import { JSDOM } from 'jsdom';
async function boot(env, withLib) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: `https://fit.test/app.html?${Math.random()}`, pretendToBeVisual: true });
  const w = dom.window;
  if (env) w.FITAPP_ENV = env;
  if (withLib) w.supabase = { createClient: () => ({}) };
  w.matchMedia = () => ({ matches: false });
  for (const k of ['window', 'document', 'location', 'history', 'localStorage', 'navigator', 'HTMLElement', 'HTMLImageElement', 'requestAnimationFrame']) Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
  globalThis.atob = w.atob;
  await import(`../../assets/js/app.js?${Math.random()}`);
  await new Promise((r) => setTimeout(r, 100));
  return w.document.body.textContent;
}
const good = { SUPABASE_URL: 'https://abc.supabase.co/rest/v1/', SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx' };
// each scenario runs in its own process (modules are cached per process)
const scenario = process.argv[2];
if (!scenario) {
  const { execFileSync } = await import('node:child_process');
  let ok = true;
  for (const s of ['missing-env', 'lib-failed']) {
    try { console.log(execFileSync(process.execPath, [new URL(import.meta.url).pathname, s]).toString().trim()); } catch (e) { ok = false; console.log(e.stdout.toString().trim()); }
  }
  process.exit(ok ? 0 : 1);
}
const text = scenario === 'missing-env' ? await boot(null, true) : await boot(good, false);
const ok = scenario === 'missing-env' ? text.includes('Connect your database') : text.includes("Couldn't connect") && !text.includes('Connect your database');
console.log(`${ok ? 'PASS' : 'FAIL'} ${scenario === 'missing-env' ? 'no env.js → setup screen' : 'library failed to load (bad signal) → "Couldn\'t connect" + auto-retry, not the setup screen'}`);
process.exit(ok ? 0 : 1);
