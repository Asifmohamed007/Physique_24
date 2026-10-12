import { app, subnav } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon } from '../core/ui.js';
import { PHASES, programStatus, phaseFor } from '../logic/program.js';
import { planForDate, completionKey } from '../logic/schedule.js';
import { addDays, formatShort, formatLong, weekdayOf, WEEKDAYS } from '../logic/dates.js';

export async function render(root) {
  const p = app.profile, today = app.today(), weeks = p.program_weeks;
  const prog = programStatus(p.start_date, today, weeks);
  const sessions = await api.loadSessions();
  const cur = prog.state === 'active' ? prog.week : prog.state === 'finished' ? weeks : 0;
  let selected = Math.max(1, cur);

  const draw = () => {
    const from = addDays(p.start_date, (selected - 1) * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const keys = new Set(sessions.filter((s) => s.planned_date).map((s) => completionKey(s.planned_date, s.name)));
    root.innerHTML = `${subnav('timeline')}
    <div class="stack">
      <section class="card">
        <div class="row between"><div><h2 style="margin:0">${prog.state === 'upcoming' ? `Starts in ${prog.daysUntil} days` : prog.state === 'finished' ? 'Program complete' : `Week ${prog.week} of ${weeks}`}</h2>
          <p class="muted" style="margin:4px 0 0">${esc(formatShort(p.start_date))} → ${esc(formatShort(prog.end))} · ${esc(prog.phase.name)}: ${esc(prog.phase.focus)}</p></div>
          <a class="btn btn-sm btn-ghost" href="#/settings">Change start date</a></div>
        <div class="phase-track" aria-hidden="true">${Array.from({ length: Math.min(weeks, 24) }, (_, i) => `<span class="${i + 1 < cur ? 'past' : i + 1 === cur ? 'now' : ''} ${PHASES.some((ph) => ph.from === i + 1 && i) ? 'ph-sep' : ''}"></span>`).join('')}</div>
      </section>
      <div class="phase-list">${PHASES.map((ph, i) => `<div class="phase ${phaseFor(cur || 1) === ph && cur ? 'current' : ''}">
        <span class="num">Weeks ${ph.from}–${ph.to}</span><h3 style="margin:4px 0">${i + 1}. ${esc(ph.name)}</h3><p class="small">${esc(ph.focus)}</p><p class="small muted" style="margin:0">Look for: ${esc(ph.look)}</p></div>`).join('')}</div>
      <section class="card">
        <h3>${icon('calendar-search')} Browse weeks</h3>
        <div class="week-grid">${Array.from({ length: weeks }, (_, i) => {
          const n = i + 1, f = addDays(p.start_date, i * 7), t = addDays(f, 6);
          const done = sessions.filter((s) => s.session_date >= f && s.session_date <= t).length;
          return `<button class="week-btn ${n === cur ? 'now' : ''}" data-w="${n}" aria-pressed="${n === selected}"><span class="num">W${n}</span>${done} done</button>`;
        }).join('')}</div>
      </section>
      <section class="card">
        <h3>Week ${selected}: ${esc(formatShort(from))} – ${esc(formatShort(addDays(from, 6)))}</h3>
        <div class="list">${days.map((d) => {
          const items = planForDate(d, app.planCtx()).filter((i) => i.status === 'planned');
          const done = sessions.filter((s) => s.session_date === d);
          const missed = d < today && items.some((i) => !keys.has(completionKey(i.plannedDate, i.name)));
          return `<div class="list-item"><div style="width:120px"><strong>${WEEKDAYS[weekdayOf(d)]}</strong><div class="small muted">${esc(formatShort(d))}</div></div>
            <div class="grow">${items.length ? esc(items.map((i) => i.name).join(', ')) : '<span class="muted">Rest</span>'}
            ${done.map((s) => `<div><a href="#/history/${esc(s.id)}" class="small">${icon('check')} ${esc(s.name)} completed</a></div>`).join('')}</div>
            ${missed ? '<span class="badge badge-danger">Missed</span>' : d === today ? '<span class="badge badge-cyan">Today</span>' : ''}</div>`;
        }).join('')}</div>
      </section>
      <p class="small muted">Visible changes vary with genetics, food, sleep and consistency, so this timeline tracks effort and trends — it can't promise a specific result by a specific date.</p>
    </div>`;
    window.lucide?.createIcons();
  };
  draw();
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) { selected = Number(b.dataset.w); draw(); } });
}
