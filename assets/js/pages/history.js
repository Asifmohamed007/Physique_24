import { app, subnav } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, emptyState } from '../core/ui.js';
import { sessionStats } from '../logic/records.js';
import { formatLong, formatShort, durationLabel } from '../logic/dates.js';
import { toDisplay } from '../logic/units.js';

export async function render(root, params) {
  if (params[0]) return detail(root, params[0]);
  const sessions = await api.loadSessions({ limit: 300 });
  const byMonth = {};
  for (const s of sessions) (byMonth[s.session_date.slice(0, 7)] ||= []).push(s);
  root.innerHTML = `${subnav('history')}
    ${sessions.length ? Object.entries(byMonth).map(([m, list]) => `
      <h2 style="margin-top:18px">${new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} <span class="small muted">${list.length} workouts</span></h2>
      <div class="card"><div class="list">${list.map((s) => `<a class="list-item" style="color:inherit;text-decoration:none" href="#/history/${esc(s.id)}">
        <div class="grow"><strong>${esc(s.name)}</strong><div class="small muted">${esc(formatShort(s.session_date))}${s.ended_at ? ` · ${durationLabel(new Date(s.ended_at) - new Date(s.started_at))}` : ''}${s.difficulty ? ` · difficulty ${s.difficulty}/10` : ''}</div></div>
        ${s.planned_date ? '' : '<span class="badge">Extra</span>'}${icon('chevron-right')}</a>`).join('')}</div></div>`).join('')
    : emptyState('history', 'No completed workouts yet', 'Finished workouts appear here with every set you logged.', '<a class="btn btn-primary" href="#/workout">Start a workout</a>')}`;
}

async function detail(root, id) {
  const s = await api.loadSessionFull(id);
  const unit = app.unit();
  if (!s) { root.innerHTML = emptyState('search-x', 'Workout not found', 'It may have been deleted.', '<a class="btn" href="#/history">Back to history</a>'); return; }
  const st = sessionStats(s.session_exercises.map((e) => ({ sets: e.exercise_sets })));
  root.innerHTML = `${subnav('history')}
    <a href="#/history" class="small">${icon('arrow-left')} All workouts</a>
    <h2 style="margin-top:10px">${esc(s.name)}</h2>
    <p class="muted">${esc(formatLong(s.session_date))}${s.status !== 'completed' ? ` · <span class="badge badge-warn">${esc(s.status)}</span>` : ''}</p>
    <div class="grid g4">
      <div class="card stat"><span class="label">Duration</span><span class="num">${s.ended_at ? durationLabel(new Date(s.ended_at) - new Date(s.started_at)) : '—'}</span></div>
      <div class="card stat"><span class="label">Sets</span><span class="num">${st.sets}</span></div>
      <div class="card stat"><span class="label">Reps</span><span class="num">${st.reps}</span></div>
      <div class="card stat"><span class="label">Volume</span><span class="num">${fmt(toDisplay(st.volume, unit))}<small>${unit}</small></span></div>
    </div>
    ${s.notes ? `<div class="notice section-gap">${esc(s.notes)}</div>` : ''}
    <div class="stack section-gap">${s.session_exercises.map((e) => `<div class="card">
      <h3>${esc(e.exercise_name)}</h3><p class="small muted">Target ${e.target_sets} × ${e.rep_min}–${e.rep_max}${e.notes ? ` · ${esc(e.notes)}` : ''}</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Set</th><th>Weight (${unit})</th><th>Reps</th><th>Status</th></tr></thead><tbody>
        ${e.exercise_sets.map((x) => `<tr><td>${x.set_number}</td><td>${x.weight_kg != null ? fmt(toDisplay(x.weight_kg, unit), 2) : '—'}</td><td>${x.reps ?? '—'}</td><td>${x.completed ? '<span class="badge badge-lime">Done</span>' : '<span class="badge">Not done</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No sets logged</td></tr>'}
      </tbody></table></div></div>`).join('')}</div>`;
}
