import { app, subnav } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, pct } from '../core/ui.js';
import { computeStreaks, weeklyCounts, consistentWeekRun, monthlyConsistency, STREAK_EXPLANATION } from '../logic/streaks.js';
import { planForDate, dayStatus, completionKey } from '../logic/schedule.js';
import { addDays, weekdayOf, WEEKDAYS_SHORT, formatShort } from '../logic/dates.js';

export async function render(root) {
  const p = app.profile, today = app.today(), target = app.settings.weekly_target;
  const [sessions, ach] = await Promise.all([api.loadSessions(), api.loadAchievements()]);
  const ctx = app.planCtx();
  const st = computeStreaks({ start: p.start_date, today, ctx, sessions });
  const weeks = weeklyCounts({ start: p.start_date, today, sessions, weeks: p.program_weeks });
  const fullWeeks = weeks.slice(0, -1);
  const metWeeks = fullWeeks.filter((w) => w.completed >= target).length;
  const months = monthlyConsistency({ start: p.start_date, today, ctx, sessions });
  const keys = new Set(sessions.filter((s) => s.planned_date).map((s) => completionKey(s.planned_date, s.name)));
  const dates = new Set(sessions.map((s) => s.session_date));
  const rate = st.scheduled ? Math.round(((st.scheduled - st.missed - st.skipped) / st.scheduled) * 100) : null;

  // six-month calendar: one row per program week
  const sw = weekdayOf(p.start_date);
  const head = Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(sw + i) % 7]);
  let cal = `<div class="cal" role="grid" aria-label="Program calendar"><span></span>${head.map((h) => `<span class="hd">${h}</span>`).join('')}`;
  for (let w = 0; w < p.program_weeks; w++) {
    cal += `<span class="wk">${w + 1}</span>`;
    for (let d = 0; d < 7; d++) {
      const iso = addDays(p.start_date, w * 7 + d);
      const s = iso > today ? (planForDate(iso, ctx).some((i) => i.status === 'planned') ? 'planned' : 'rest') : dayStatus(iso, today, planForDate(iso, ctx), keys, dates);
      cal += `<span class="d" data-s="${s}" title="${esc(formatShort(iso))}: ${s}"></span>`;
    }
  }
  cal += '</div>';

  root.innerHTML = `${subnav('streaks')}
  <div class="stack">
    <section class="grid g4">
      <div class="card stat"><span class="label">${icon('flame')} Current streak</span><span class="num accent-lime">${st.current}</span><span class="label">workouts in a row</span></div>
      <div class="card stat"><span class="label">${icon('mountain')} Longest streak</span><span class="num">${st.longest}</span></div>
      <div class="card stat"><span class="label">${icon('trophy')} Completed</span><span class="num">${st.total}</span><span class="label">workouts in total</span></div>
      <div class="card stat"><span class="label">${icon('percent')} Completion rate</span><span class="num">${rate == null ? '—' : `${rate}<small>%</small>`}</span><span class="label">of scheduled sessions</span></div>
    </section>
    <section class="grid g3">
      <div class="card stat"><span class="label">Weeks hitting ${target}/week</span><span class="num">${metWeeks}<small>/ ${fullWeeks.length}</small></span><span class="label">Best run ${consistentWeekRun(weeks, target)} weeks</span></div>
      <div class="card stat"><span class="label">Missed · skipped</span><span class="num">${st.missed}<small>·</small>${st.skipped}</span><span class="label">rest days never count here</span></div>
      <div class="card stat"><span class="label">Rescheduled</span><span class="num">${st.rescheduled}</span><span class="label">moved, not missed</span></div>
    </section>
    <div class="notice">${icon('info')} ${esc(STREAK_EXPLANATION)} Change your weekly target in <a href="#/settings">Settings</a>.</div>
    ${st.missed + st.skipped > 0 && st.current < 3 ? '<div class="notice lime">Missed sessions happen. The next planned workout is the only one that matters — no need to make anything up.</div>' : ''}
    <section class="card">
      <h3>${icon('calendar-days')} Six-month calendar</h3>
      <div style="max-width:520px">${cal}</div>
      <div class="legend"><span><i style="background:var(--lime)"></i>Completed</span><span><i style="background:rgba(255,100,100,.5)"></i>Missed</span><span><i style="background:rgba(255,181,71,.45)"></i>Skipped</span><span><i style="border:1px dashed var(--cyan)"></i>Rescheduled</span><span><i style="background:#10151e;border:1px solid var(--line)"></i>Rest</span><span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>Planned</span></div>
    </section>
    <section class="card"><h3>${icon('calendar-range')} Monthly consistency</h3>
      ${months.length ? `<div class="list">${months.map((m) => `<div class="list-item"><strong style="width:90px">${new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong>
        <div class="grow"><div class="bar"><span style="width:${m.rate == null ? 0 : Math.round(m.rate * 100)}%"></span></div></div><span class="small" style="width:110px;text-align:right">${m.completed}/${m.scheduled} sessions</span></div>`).join('')}</div>` : '<p class="muted">Your program has not started yet.</p>'}
    </section>
    <section class="card"><h3>${icon('award')} Achievements</h3>
      <div class="grid g4">${ach.all.map((a) => { const got = ach.earned[a.code]; return `<div class="card card-tight" style="${got ? 'border-color:rgba(198,244,50,.45)' : 'opacity:.55'}">
        <div class="row">${icon(got ? 'badge-check' : 'lock', got ? 'accent-lime' : '')}<strong>${esc(a.name)}</strong></div>
        <p class="small muted" style="margin:6px 0 0">${esc(a.description)}</p>${got ? `<p class="small accent-lime" style="margin:4px 0 0">Earned ${esc(formatShort(got.slice(0, 10)))}</p>` : ''}</div>`; }).join('')}</div>
    </section>
  </div>`;
}
