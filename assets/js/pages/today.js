import { app, rerender } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, dialog, confirmDialog, toast, emptyState } from '../core/ui.js';
import { planForDate, dayStatus, rescheduleWarnings, completionKey } from '../logic/schedule.js';
import { addDays, formatLong, formatShort, weekdayOf, WEEKDAYS, WEEKDAYS_SHORT } from '../logic/dates.js';
import { buildPlan, toSessionExercise, saveExtras } from './plan.js';

export async function render(root) {
  const today = app.today();
  const [active, sessions, history] = await Promise.all([api.loadActiveSession(), api.loadSessions(), api.recentHistory(5)]);
  const ctx = app.planCtx();
  const items = planForDate(today, ctx);
  const keys = new Set(sessions.filter((s) => s.planned_date).map((s) => completionKey(s.planned_date, s.name)));
  const dates = new Set(sessions.map((s) => s.session_date));
  const doneToday = sessions.filter((s) => s.session_date === today);
  const plans = items.map((it) => (app.templatesById[it.templateId] ? buildPlan(app.templatesById[it.templateId], { sessions, history }) : null));

  // week strip starting Saturday (the first gym day)
  const offset = (weekdayOf(today) - 6 + 7) % 7;
  const weekStart = addDays(today, -offset);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const its = planForDate(d, ctx);
    return { d, its, st: dayStatus(d, today, its, keys, dates) };
  });

  root.innerHTML = `
    <div class="stack">
      <div class="card card-tight">
        <div class="row between"><strong>${esc(formatLong(today))}</strong><span class="badge badge-cyan">${esc(app.tz())}</span></div>
        <div class="grid" style="grid-template-columns:repeat(7,1fr);gap:6px;margin-top:12px">
          ${strip.map(({ d, its, st }) => `<div style="text-align:center;padding:8px 2px;border-radius:10px;background:${d === today ? 'var(--lime-soft)' : 'var(--surface)'};border:1px solid ${d === today ? 'rgba(198,244,50,.5)' : 'var(--line-soft)'}">
            <div class="small" style="font-weight:700;color:${d === today ? 'var(--lime)' : 'var(--muted)'}">${WEEKDAYS_SHORT[weekdayOf(d)]}</div>
            <div class="num" style="font-size:1.15rem">${Number(d.slice(8))}</div>
            <div style="font-size:.62rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(its.find((i) => i.status === 'planned')?.name.split(' ')[0] || (st === 'rest' ? 'Rest' : st))}</div>
            <div style="height:4px;width:60%;margin:5px auto 0;border-radius:4px;background:${{ completed: 'var(--lime)', missed: 'var(--danger)', skipped: 'var(--warn)', rescheduled: 'var(--cyan)', extra: 'var(--lime)' }[st] || 'transparent'}"></div>
          </div>`).join('')}
        </div>
      </div>

      ${active ? `<div class="notice lime row between"><span>You have an unfinished workout: <strong>${esc(active.name)}</strong> (started ${esc(formatShort(active.session_date))}).</span><a class="btn btn-primary btn-sm" href="#/active">Resume</a></div>` : ''}

      ${items.length ? items.map((it, idx) => planCard(it, idx, { done: keys.has(completionKey(it.plannedDate, it.name)), active, plan: plans[idx] })).join('')
        : `<section class="card">${emptyState('moon', 'Rest day', 'Recovery is part of the program. An easy walk, some mobility, good food and sleep are enough today. Your streak is safe.',
          `<button class="btn btn-ghost" data-action="extra">${icon('plus')} Train anyway</button>`)}</section>`}

      ${doneToday.length ? `<section class="card"><h3>${icon('check-circle-2')} Completed today</h3>${doneToday.map((s) => `<a class="list-item" style="color:inherit;text-decoration:none" href="#/history/${esc(s.id)}"><strong class="grow">${esc(s.name)}</strong>${icon('chevron-right')}</a>`).join('')}</section>` : ''}
    </div>`;

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const it = items[Number(btn.dataset.idx)];
    const a = btn.dataset.action;
    try {
      if (a === 'start') { btn.setAttribute('aria-busy', 'true'); await startWorkout({ template: app.templatesById[it.templateId], plannedDate: it.plannedDate, plan: plans[Number(btn.dataset.idx)] }); }
      if (a === 'skip') await skip(it);
      if (a === 'reschedule') await reschedule(it, today);
      if (a === 'undo') { await api.deleteOverride(it.override.id); await app.reload('overrides'); rerender(); }
      if (a === 'extra') await extraWorkout();
    } catch (err) {
      btn.removeAttribute('aria-busy');
      toast(err.message, 'error', 5000);
    }
  });
}

function planCard(it, idx, { done, active, plan }) {
  const moved = it.origin === 'moved' ? `<span class="badge badge-cyan">Moved from ${esc(formatShort(it.plannedDate))}</span>` : '';
  let actions = '';
  if (done) actions = `<span class="badge badge-lime">${icon('check')} Completed</span>`;
  else if (it.status === 'skipped') actions = `<span class="badge badge-warn">Skipped</span><button class="btn btn-sm btn-ghost" data-action="undo" data-idx="${idx}">Undo</button>`;
  else if (it.status === 'rescheduled') actions = `<span class="badge badge-cyan">Moved to ${esc(formatShort(it.override.rescheduled_to))}</span><button class="btn btn-sm btn-ghost" data-action="undo" data-idx="${idx}">Undo</button>`;
  else if (active) actions = '<a class="btn btn-primary" href="#/active">Resume active workout</a>';
  else actions = `<button class="btn btn-primary btn-lg" data-action="start" data-idx="${idx}">${icon('play')} Start Workout</button>
      <button class="btn btn-ghost" data-action="reschedule" data-idx="${idx}">${icon('calendar-plus')} Reschedule</button>
      <button class="btn btn-ghost" data-action="skip" data-idx="${idx}">${icon('skip-forward')} Skip</button>`;
  const row = (x, n) => `<div class="list-item">
      <span class="num muted" style="width:22px">${n}</span>
      <div class="grow"><strong>${esc(x.exercise.name)}</strong>${x.rotated ? ` <span class="badge badge-cyan" title="Rotates with ${esc(x.base.name)}">variation ${x.variant}/${x.of}</span>` : ''}
        <div class="small muted">${esc(x.exercise.equipment)} · ${x.target_sets} × ${x.rep_min}–${x.rep_max}${x.exercise.per_side ? '/side' : ''}${x.trimmed ? ' · trimmed to fit' : ''}</div></div>
    </div>`;
  const p = plan;
  return `<section class="card">
    <div class="row between"><div><h2 style="margin:0">${esc(it.name)}</h2><p class="muted" style="margin:4px 0 0">${esc(it.focus)}</p></div>${moved}</div>
    ${p ? `<div class="row" style="margin-top:12px;gap:8px">
        <span class="badge badge-lime">${icon('clock')} about ${p.minutes} min of your ${p.budget} min</span>
        ${p.pace !== 1 ? `<span class="badge" title="Learned from your recent workouts">your pace × ${p.pace}</span>` : ''}
        ${p.timesDone ? `<span class="badge">session ${p.timesDone + 1} of this workout</span>` : ''}
      </div>
      ${p.cap ? `<p class="small muted" style="margin:8px 0 0">You've been finishing about ${p.cap} exercises, so today's plan has ${p.main.length}. The rest are optional.</p>` : ''}
      <div class="list" style="margin-top:12px">${p.main.map((x, i) => row(x, i + 1)).join('') || '<p class="muted">This template has no exercises. Add some in Settings.</p>'}</div>
      ${p.extras.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;color:var(--cyan);font-weight:600">If you have time (${p.extras.length})</summary>
        <div class="list">${p.extras.map((x, i) => row(x, p.main.length + i + 1)).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">These show as quick-add buttons during your workout.</p></details>` : ''}`
    : '<p class="muted">Template not found.</p>'}
    <div class="row" style="margin-top:14px">${actions}</div>
    <p class="small muted" style="margin:12px 0 0">Warm up 5–8 minutes, then 2–4 lighter ramp-up sets on the first lift. Change your session length and rotation in Settings.</p>
  </section>`;
}

/** Create the in-progress session (or resume one that already exists) and open the tracker. */
export async function startWorkout({ template, plannedDate = null, plan = null }) {
  const existing = await api.loadActiveSession();
  if (existing) { location.hash = '#/active'; return; }
  const p = plan || (template ? buildPlan(template, { sessions: await api.loadSessions(), history: await api.recentHistory(5) }) : { main: [], extras: [] });
  const exs = p.main.map(toSessionExercise);
  const id = crypto.randomUUID();
  saveExtras(id, p.extras);
  try {
    await api.startSession({ id, template, plannedDate, sessionDate: app.today(), exercises: exs, restDefault: app.settings.default_rest_seconds });
  } catch (err) {
    if (/duplicate key/i.test(err.message)) {
      if (/one_completion/i.test(err.message)) throw new Error('This workout is already completed for that day.');
      location.hash = '#/active'; return; // started on another device
    }
    throw err;
  }
  location.hash = '#/active';
}

async function skip(it) {
  const note = await dialog({
    title: `Skip ${it.name}?`,
    body: `<p class="muted">Skipping is recorded so your history stays honest. It resets the streak count, and that's fine — the next session is what matters. Moving it to another day keeps the streak instead.</p>
      <label class="field"><span>Reason (optional)</span><input name="note" maxlength="300" placeholder="e.g. travelling, feeling unwell"></label>`,
    actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" data-ok>Skip workout</button>',
    bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => close(d.querySelector('[name=note]').value.trim())),
  });
  if (note === null) return;
  await api.saveOverride({ scheduled_date: it.origin === 'moved' ? it.override.rescheduled_to : it.plannedDate, template_id: it.templateId, template_name: it.name, status: 'skipped', note });
  await app.reload('overrides');
  rerender();
}

async function reschedule(it, today) {
  const tpl = app.templatesById[it.templateId] || { name: it.name, muscle_tags: it.muscleTags };
  const options = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const result = await dialog({
    title: `Move ${it.name}`,
    body: `<p class="muted">Pick a new day. Nothing shifts automatically — only this workout moves.</p>
      <label class="field"><span>New day</span><select name="to">${options.map((d) => `<option value="${d}">${WEEKDAYS[weekdayOf(d)]}, ${formatShort(d)}</option>`).join('')}</select></label>
      <div id="warn" style="margin-top:12px"></div>`,
    actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Move workout</button>',
    bind: (d, close) => {
      const sel = d.querySelector('[name=to]');
      const show = () => {
        const w = rescheduleWarnings(sel.value, tpl, app.planCtx());
        d.querySelector('#warn').innerHTML = w.map((x) => `<div class="notice warn" style="margin-top:6px">${esc(x)}</div>`).join('');
      };
      sel.addEventListener('change', show); show();
      d.querySelector('[data-ok]').addEventListener('click', () => close(sel.value));
    },
  });
  if (!result) return;
  const base = it.origin === 'moved' ? it.override : null;
  if (base) await api.saveOverride({ ...base, rescheduled_to: result, id: undefined, created_at: undefined, updated_at: undefined });
  else await api.saveOverride({ scheduled_date: it.plannedDate, template_id: it.templateId, template_name: it.name, status: 'rescheduled', rescheduled_to: result });
  await app.reload('overrides');
  toast(`${it.name} moved to ${formatShort(result)}`, 'success');
  rerender();
}

async function extraWorkout() {
  const id = await dialog({
    title: 'Train on a rest day',
    body: `<p class="muted">An extra session counts toward your totals but isn't needed for the streak. Keep it light if you're recovering.</p>
      <label class="field"><span>Workout</span><select name="t">${app.templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}<option value="">Empty custom workout</option></select></label>`,
    actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Start</button>',
    bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => close({ t: d.querySelector('[name=t]').value })),
  });
  if (!id) return;
  if (!(await confirmDialog('Start this workout now?', { confirmLabel: 'Start workout', title: 'Start workout' }))) return;
  await startWorkout({ template: id.t ? app.templatesById[id.t] : null, plannedDate: null });
}
