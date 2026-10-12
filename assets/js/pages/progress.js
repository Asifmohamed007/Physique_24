import { app, subnav } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, emptyState } from '../core/ui.js';
import { lineChart, barChart, destroyAll, COLORS } from '../core/charts.js';
import { weeklyCounts } from '../logic/streaks.js';
import { bestOf } from '../logic/records.js';
import { addDays, formatShort, rangeDays } from '../logic/dates.js';
import { toDisplay } from '../logic/units.js';

export async function render(root) {
  const today = app.today();
  const from = addDays(today, -29);
  const p = app.profile, unit = app.unit();
  const [measurements, sessions, food, names] = await Promise.all([
    api.loadMeasurements(), api.loadSessions(), api.loadNutrition(from, today), api.loggedExerciseNames(),
  ]);
  const wts = measurements.filter((m) => m.weight_kg != null);
  const waists = measurements.filter((m) => m.waist_cm != null);
  const weeks = weeklyCounts({ start: p.start_date, today, sessions, weeks: p.program_weeks });
  const days = rangeDays(from, today);
  const perDay = Object.fromEntries(days.map((d) => [d, { p: 0, k: 0, n: 0 }]));
  for (const e of food) if (perDay[e.entry_date]) { perDay[e.entry_date].p += Number(e.protein_g); perDay[e.entry_date].k += Number(e.kcal); perDay[e.entry_date].n++; }
  const loggedDays = days.filter((d) => perDay[d].n);
  const hitDays = loggedDays.filter((d) => perDay[d].p >= p.protein_min_g).length;

  // monthly summary
  const months = {};
  const mk = (d) => (months[d.slice(0, 7)] ||= { w: 0, weights: [], waists: [] });
  for (const s of sessions) mk(s.session_date).w++;
  for (const m of measurements) { if (m.weight_kg != null) mk(m.measured_on).weights.push(Number(m.weight_kg)); if (m.waist_cm != null) mk(m.measured_on).waists.push(Number(m.waist_cm)); }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  const chartCard = (id, title, ic, has, emptyText, extra = '') => `<div class="card"><div class="card-head"><h3>${icon(ic)} ${title}</h3>${extra}</div>
    ${has ? `<div style="height:230px"><canvas id="${id}"></canvas></div>` : emptyState(ic, 'No data yet', emptyText)}</div>`;

  root.innerHTML = `${subnav('progress')}
  <div class="stack">
    <div class="grid g2">
      ${chartCard('c-weight', 'Weight trend', 'scale', wts.length > 0, 'Log your morning weight on the Measurements page. Weekly averages beat single weigh-ins.', '<a class="btn btn-sm btn-ghost" href="#/measurements">Add</a>')}
      ${chartCard('c-waist', 'Waist trend', 'ruler', waists.length > 0, 'Measure your waist once a week at the same spot.', '<a class="btn btn-sm btn-ghost" href="#/measurements">Add</a>')}
    </div>
    <div class="card"><div class="card-head"><h3>${icon('dumbbell')} Strength progression</h3>
      ${names.length ? `<select id="ex-pick" style="width:auto;min-height:38px" aria-label="Exercise">${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>` : ''}</div>
      ${names.length ? '<div style="height:240px"><canvas id="c-str"></canvas></div><p class="small muted" id="str-note" style="margin:8px 0 0"></p>' : emptyState('dumbbell', 'No lifts logged yet', 'Complete a workout to start tracking strength for each exercise.')}
    </div>
    <div class="grid g2">
      ${chartCard('c-att', 'Weekly attendance', 'calendar-check', sessions.length > 0, 'Workouts you complete each program week appear here.')}
      ${chartCard('c-pro', 'Protein, last 30 days', 'beef', loggedDays.length > 0, 'Log meals on the Nutrition page to see protein consistency.', loggedDays.length ? `<span class="badge badge-lime">${hitDays}/${loggedDays.length} logged days on target</span>` : '')}
    </div>
    ${chartCard('c-kcal', 'Calorie intake, last 30 days', 'flame', loggedDays.length > 0, 'Daily calorie estimates appear after you log food.')}
    <div class="card"><h3>${icon('calendar-range')} Monthly progress</h3>
      ${Object.keys(months).length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th>Workouts</th><th>Avg weight</th><th>Waist (first → last)</th></tr></thead><tbody>
      ${Object.entries(months).sort().reverse().map(([m, v]) => `<tr><td>${new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td><td>${v.w}</td>
        <td>${avg(v.weights) != null ? `${fmt(toDisplay(avg(v.weights), unit), 1)} ${unit}` : '—'}</td><td>${v.waists.length ? `${fmt(v.waists[0], 1)} → ${fmt(v.waists[v.waists.length - 1], 1)} cm` : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('calendar-range', 'Nothing to summarise yet', 'Monthly totals build up as you log workouts and measurements.')}
    </div>
    <p class="small muted">Judge progress by strength, waist, photos and energy together. Water, salt and digestion move the scale day to day.</p>
  </div>`;

  if (wts.length) lineChart(root.querySelector('#c-weight'), { labels: wts.map((m) => formatShort(m.measured_on)), data: wts.map((m) => toDisplay(m.weight_kg, unit)), label: `Weight (${unit})`, unit: ` ${unit}` });
  if (waists.length) lineChart(root.querySelector('#c-waist'), { labels: waists.map((m) => formatShort(m.measured_on)), data: waists.map((m) => Number(m.waist_cm)), label: 'Waist (cm)', color: COLORS.cyan, unit: ' cm' });
  if (sessions.length) barChart(root.querySelector('#c-att'), { labels: weeks.map((w) => `W${w.week}`), data: weeks.map((w) => w.completed), label: 'Workouts', target: app.settings.weekly_target, max: 7 });
  if (loggedDays.length) {
    barChart(root.querySelector('#c-pro'), { labels: days.map(formatShort), data: days.map((d) => Math.round(perDay[d].p)), label: 'Protein (g)', target: p.protein_min_g });
    lineChart(root.querySelector('#c-kcal'), { labels: days.map(formatShort), data: days.map((d) => (perDay[d].n ? Math.round(perDay[d].k) : null)), label: 'Calories', color: COLORS.cyan, target: p.kcal_min, unit: ' kcal' });
  }

  let strChart = null;
  const drawStrength = async (name) => {
    const hist = await api.exerciseHistory(name);
    const pts = hist.map((h) => ({ date: h.date, b: bestOf(h.sets) })).filter((x) => x.b);
    strChart?.destroy();
    const weighted = pts.some((x) => x.b.max_weight > 0);
    strChart = lineChart(root.querySelector('#c-str'), {
      labels: pts.map((x) => formatShort(x.date)),
      data: pts.map((x) => (weighted ? toDisplay(Math.round(x.b.est_1rm * 10) / 10, unit) : x.b.max_reps)),
      label: weighted ? `Estimated 1-rep max (${unit})` : 'Best reps', unit: weighted ? ` ${unit}` : '',
    });
    root.querySelector('#str-note').textContent = weighted
      ? 'Estimated 1RM combines weight and reps from your best set each session (Epley formula). It is a trend line, not a lift to attempt.'
      : 'Bodyweight exercise: showing best reps per session.';
  };
  const pick = root.querySelector('#ex-pick');
  if (pick) { pick.addEventListener('change', () => drawStrength(pick.value)); drawStrength(pick.value); }
  return destroyAll;
}
