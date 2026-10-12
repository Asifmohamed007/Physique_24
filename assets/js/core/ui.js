// Small UI toolkit: escaping, icons, toasts, dialogs, form helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<i data-lucide="${name}" class="ico ${cls}" aria-hidden="true"></i>`;
export function refreshIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2 }, nameAttr: 'data-lucide', root });
}

export const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const pct = (a, b) => (b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);

export function toast(message, kind = 'info', ms = 3200) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms);
}

/** Opens a dialog. `render` returns inner HTML; `bind(dialog, close)` wires events. Resolves with close(value). */
export function dialog({ title, body, actions = '', wide = false, bind }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = `sheet ${wide ? 'sheet-wide' : ''}`;
    d.innerHTML = `
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-body">${body}</div>
      ${actions ? `<div class="sheet-actions">${actions}</div>` : ''}`;
    document.body.append(d);
    let done = false;
    const close = (v) => { if (done) return; done = true; d.classList.add('out'); setTimeout(() => { d.close(); d.remove(); }, 180); resolve(v); };
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(null); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    d.showModal();
    refreshIcons(d);
    bind?.(d, close);
    d.querySelector('input, select, textarea, button:not([data-close])')?.focus();
  });
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return dialog({
    title, body: `<p>${esc(message)}</p>`,
    actions: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
    bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => close(true)),
  }).then(Boolean);
}

export const emptyState = (iconName, title, text, cta = '') => `
  <div class="empty">
    <div class="empty-ico">${icon(iconName)}</div>
    <h3>${esc(title)}</h3><p>${esc(text)}</p>${cta}
  </div>`;

export const loading = (label = 'Loading') => `<div class="loading" role="status"><span class="spinner"></span>${esc(label)}…</div>`;

export const errorBox = (err, retry = true) => `
  <div class="error-box" role="alert">${icon('alert-triangle')}
    <div><strong>Couldn't load this.</strong><p>${esc(err?.message || err)}</p>${retry ? '<button class="btn btn-ghost btn-sm" data-action="reload">Try again</button>' : ''}</div>
  </div>`;

/** Read a form into an object; empty strings become null for number inputs. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function fieldError(form, name, message) {
  const el = form.elements[name];
  if (!el) return;
  el.setAttribute('aria-invalid', 'true');
  let msg = el.parentElement.querySelector('.field-error');
  if (!msg) { msg = document.createElement('small'); msg.className = 'field-error'; el.parentElement.append(msg); }
  msg.textContent = message;
  el.focus();
}
export function clearErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';

/** Animate a number counting up (respects reduced motion). */
export function countUp(el, to, decimals = 0, ms = 700) {
  if (prefersReducedMotion() || !Number.isFinite(to)) { el.textContent = fmt(to, decimals); return; }
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / ms);
    el.textContent = fmt(to * (1 - (1 - k) ** 3), decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function footerHTML() {
  return `<footer class="site-footer">© ${new Date().getFullYear()} Developed by Asif Mohamed | All Rights Reserved.</footer>`;
}
