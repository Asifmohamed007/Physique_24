// Sign in, create account, reset password, and set a new password from the email link.
import { sb } from './core/supabase.js';
import { isConfigured, SITE_URL } from './core/config.js';
import { $, esc, footerHTML } from './core/ui.js';

const view = $('#auth');
$('#foot').outerHTML = footerHTML();
const params = new URLSearchParams(location.search);

function msg(text, kind = 'error') {
  const el = $('#msg');
  el.className = `notice ${kind === 'ok' ? 'lime' : 'warn'}`;
  el.hidden = false;
  el.textContent = text;
}
function busy(btn, on, label) { btn.toggleAttribute('aria-busy', on); if (label) btn.textContent = label; }

const FORMS = {
  signin: `<h1>Welcome back</h1><p class="muted">Sign in to log today's training.</p>
    <form id="f" novalidate class="stack">
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
    </form>
    <p class="row between small" style="margin-top:16px"><a href="#signup">Create an account</a><a href="#reset">Forgot password?</a></p>`,
  signup: `<h1>Create your account</h1><p class="muted">Your workouts, food log and photos are private to you.</p>
    <form id="f" novalidate class="stack">
      <label class="field"><span>Name</span><input name="full_name" autocomplete="name" maxlength="120" required></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password (8+ characters)</span><input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Create account</button>
    </form>
    <p class="small" style="margin-top:16px">Already have an account? <a href="#signin">Sign in</a></p>`,
  reset: `<h1>Reset password</h1><p class="muted">We'll email you a link to choose a new password.</p>
    <form id="f" novalidate class="stack">
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Send reset link</button>
    </form>
    <p class="small" style="margin-top:16px"><a href="#signin">Back to sign in</a></p>`,
  update: `<h1>Choose a new password</h1>
    <form id="f" novalidate class="stack">
      <label class="field"><span>New password</span><input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field"><span>Repeat password</span><input name="password2" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Save new password</button>
    </form>`,
};

let mode = 'signin';
function show(m) {
  mode = FORMS[m] ? m : 'signin';
  $('#form-slot').innerHTML = FORMS[mode];
  $('#msg').hidden = true;
  $('#f').addEventListener('submit', submit);
  $('#f input')?.focus();
}

async function submit(e) {
  e.preventDefault();
  const f = e.currentTarget, btn = f.querySelector('[type=submit]'), label = btn.textContent;
  const email = f.email?.value.trim();
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('Enter a valid email address.');
  if (f.password && mode !== 'signin' && f.password.value.length < 8) return msg('Use a password with at least 8 characters.');
  busy(btn, true, 'Please wait…');
  try {
    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email, password: f.password.value });
      if (error) throw error;
      location.replace('app.html');
    } else if (mode === 'signup') {
      const name = f.full_name.value.trim();
      if (!name) throw new Error('Enter your name.');
      const { data, error } = await sb.auth.signUp({
        email, password: f.password.value,
        options: { data: { full_name: name, timezone: 'Asia/Qatar' }, emailRedirectTo: `${SITE_URL}/app.html` },
      });
      if (error) throw error;
      if (data.session) location.replace('app.html');
      else { msg('Check your email and tap the confirmation link, then sign in.', 'ok'); f.reset(); }
    } else if (mode === 'reset') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/login.html?recovery=1` });
      if (error) throw error;
      msg('If that email has an account, a reset link is on its way.', 'ok');
    } else if (mode === 'update') {
      if (f.password.value !== f.password2.value) throw new Error('Passwords do not match.');
      const { error } = await sb.auth.updateUser({ password: f.password.value });
      if (error) throw error;
      msg('Password updated. Opening the app…', 'ok');
      setTimeout(() => location.replace('app.html'), 900);
    }
  } catch (err) {
    const m = err.message || String(err);
    msg(/invalid login/i.test(m) ? 'Email or password is incorrect.' : /not confirmed/i.test(m) ? 'Confirm your email first — check your inbox for the link.' : /failed to fetch/i.test(m) ? 'No connection. Check your internet and try again.' : m);
  } finally { busy(btn, false, label); }
}

async function boot() {
  if (isConfigured && (!window.supabase || !sb)) {
    $('#form-slot').innerHTML = '<h1>Couldn\'t connect</h1><p class="muted">The sign-in files didn\'t finish loading, usually a weak signal.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button>';
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }
  if (!isConfigured || !sb) {
    $('#form-slot').innerHTML = '<h1>Almost ready</h1><p class="muted">Add your Supabase URL and anon key to <code>assets/js/env.js</code> (see README, step 3), then reload this page.</p>';
    return;
  }
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') show('update'); });
  if (params.get('recovery')) { show('update'); return; }
  const { data } = await sb.auth.getSession();
  if (data.session) { location.replace('app.html'); return; }
  show(location.hash.slice(1) || 'signin');
  if (params.get('deleted')) msg('Your account and all of its data were deleted.', 'ok');
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
}
boot();
