import { app } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, pct, countUp, emptyState } from '../core/ui.js';
import { barChart, destroyAll } from '../core/charts.js';
import { planForDate } from '../logic/schedule.js';
import { computeStreaks, weeklyCounts, programWeekOf } from '../logic/streaks.js';
import { programStatus } from '../logic/program.js';
import { totals, sumWater } from '../logic/nutrition.js';
import { bestOf } from '../logic/records.js';
import { addDays, formatLong, formatShort, WEEKDAYS } from '../logic/dates.js';
import { toDisplay } from '../logic/units.js';

export async function render(root) {
  const today = app.today();
  const p = app.profile;
  const [sessions, active, measurements, food, water, prs, exRows] = await Promise.all([
    api.loadSessions(), api.loadActiveSession(), api.loadMeasurements(),
    api.loadNutrition(today), api.loadWater(today), api.loadPRs(6), api.recentExerciseRows(300),
  ]);

  const ctx = app.planCtx();
  const plan = planForDate(today, ctx);
  const todayPlan = plan.filter((i) => i.status === 'planned');
  const doneToday = sessions.filter((s) => s.session_date === today);
  const streak = computeStreaks({ start: p.start_date, today, ctx, sessions });
  const prog = programStatus(p.start_date, today, p.program_weeks);
  const weekNo = Math.max(1, programWeekOf(p.start_date, today));
  const weeks = weeklyCounts({ start: p.start_date, today, sessions, weeks: p.program_weeks });
  const thisWeek = weeks[weeks.length - 1]?.completed ?? 0;
  const target = app.settings.weekly_target;
  const lastM = [...measurements].reverse();
  const lastWeight = lastM.find((m) => m.weight_kg != null);
  const lastWaist = lastM.find((m) => m.waist_cm != null);
  const nut = totals(food);
  const waterMl = sumWater(water);
  const unit = app.unit();

  // next scheduled workout after today
  let upcoming = null;
  for (let i = 1; i <= 14 && !upcoming; i++) {
    const d = addDays(today, i);
    const it = planForDate(d, ctx).find((x) => x.status === 'planned');
    if (it) upcoming = { date: d, ...it };
  }

  // strength improvements: earliest vs latest best estimated 1RM in recent history
  const byName = {};
  for (const r of exRows) (byName[r.name] ||= []).push(r);
  const improvements = Object.entries(byName).map(([name, list]) => {
    const sorted = list.sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ date: r.date, e: bestOf(r.sets)?.est_1rm || 0 })).filter((x) => x.e > 0);
    if (sorted.length < 2) return null;
    const first = sorted[0].e, last = sorted[sorted.length - 1].e;
    return { name, first, last, change: (last - first) / first };
  }).filter((x) => x && x.change > 0.005).sort((a, b) => b.change - a.change).slice(0, 4);

  const isNew = !sessions.length && !measurements.length && !food.length;
  const workoutName = todayPlan.map((i) => i.name).join(' + ');
  const focus = todayPlan.map((i) => i.focus).filter(Boolean).join(' · ');

  root.innerHTML = `
  <div class="stack">
    <section class="panel-hero">
      <div class="stripe"></div>
      <p class="muted" style="margin:0 0 6px">${esc(formatLong(today))} · Week ${prog.state === 'active' ? prog.week : prog.state === 'upcoming' ? `starts in ${prog.daysUntil} days` : `${p.program_weeks} (complete)`} of ${p.program_weeks}</p>
      <div class="day-big">${esc(WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()])}</div>
      <h2 style="margin:10px 0 4px;color:${todayPlan.length ? 'var(--lime)' : 'var(--cyan)'}">${todayPlan.length ? esc(workoutName) : 'Rest & recover'}</h2>
      <p class="muted" style="max-width:56ch">${todayPlan.length ? esc(focus) : 'No lifting today. An easy walk, light mobility and normal meals are enough.'}</p>
      <div class="row" style="margin-top:14px">
        ${active
          ? `<a class="btn btn-primary btn-lg" href="#/active">${icon('play')} Resume workout</a>`
          : todayPlan.length && !doneToday.length
            ? `<a class="btn btn-primary btn-lg" href="#/workout">${icon('play')} Start Workout</a>`
            : doneToday.length
              ? `<span class="badge badge-lime" style="font-size:.95rem;padding:8px 14px">${icon('check')} Workout completed today</span>`
              : `<a class="btn btn-cyan" href="#/workout">${icon('calendar')} See this week</a>`}
        ${todayPlan.length && !doneToday.length && !active ? '<span class="badge">Not started</span>' : ''}
      </div>
    </section>

    ${isNew ? `<section class="card">
      <h3>${icon('flag')} Start here</h3>
      <p class="muted">Nothing is logged yet, so these cards are empty. Record these first and the dashboard fills itself in:</p>
      <ol style="margin:0;padding-left:1.2em;line-height:2">
        <li><a href="#/measurements">Log today's weight and waist</a> — your baseline.</li>
        <li><a href="#/settings">Check your start date, gym times and targets</a>.</li>
        <li><a href="#/workout">Start your first workout</a> and record each set.</li>
        <li><a href="#/nutrition">Log your morning protein</a> (4 eggs or 150 g chicken).</li>
      </ol>
    </section>` : ''}

    <section class="grid g4">
      <div class="card stat"><span class="label">${icon('flame')} Current streak</span><span class="num accent-lime" data-count="${streak.current}">0</span><span class="label">Longest ${streak.longest}</span></div>
      <div class="card stat"><span class="label">${icon('target')} This week</span><span class="num"><span data-count="${thisWeek}">0</span><small>/ ${target}</small></span><div class="bar" style="margin-top:8px"><span data-w="${pct(thisWeek, target)}"></span></div></div>
      <div class="card stat"><span class="label">${icon('trophy')} Total workouts</span><span class="num" data-count="${streak.total}">0</span><span class="label">Program week ${Math.min(weekNo, p.program_weeks)}</span></div>
      <div class="card stat"><span class="label">${icon('scale')} Latest weight</span>
        <span class="num">${lastWeight ? `${fmt(toDisplay(lastWeight.weight_kg, unit), 1)}<small>${unit}</small>` : '—'}</span>
        <span class="label">${lastWaist ? `Waist ${fmt(lastWaist.waist_cm, 1)} cm` : '<a href="#/measurements">Add measurements</a>'}</span></div>
    </section>

    <section class="grid g3">
      <div class="card">
        <div class="card-head"><h3>${icon('beef')} Nutrition today</h3><a class="btn btn-sm btn-ghost" href="#/nutrition">Log food</a></div>
        <div class="row" style="justify-content:space-around">
          <div class="ring" style="--p:${pct(nut.protein_g, p.protein_min_g)}"><div><span class="num">${fmt(nut.protein_g)}</span><small>/ ${p.protein_min_g} g protein</small></div></div>
          <div class="ring" style="--p:${pct(nut.kcal, p.kcal_min)};--c:var(--cyan)"><div><span class="num">${fmt(nut.kcal)}</span><small>/ ${fmt(p.kcal_min)} kcal</small></div></div>
        </div>
        <p class="small muted" style="margin:12px 0 0">Estimates. ${nut.protein_g < p.protein_min_g ? `${fmt(p.protein_min_g - nut.protein_g)} g protein to go.` : 'Protein target reached.'}</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>${icon('glass-water')} Water</h3><a class="btn btn-sm btn-ghost" href="#/nutrition">Add</a></div>
        <div class="stat"><span class="num accent-cyan">${fmt(waterMl / 1000, 2)}<small>/ ${fmt(p.water_ml / 1000, 1)} L</small></span></div>
        <div class="bar cyan" style="margin-top:12px"><span data-w="${pct(waterMl, p.water_ml)}"></span></div>
        <p class="small muted" style="margin:12px 0 0">Drink more on hot days and after training.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>${icon('calendar-clock')} Up next</h3></div>
        ${upcoming ? `<p class="num" style="font-size:1.5rem;margin:0">${esc(upcoming.name)}</p>
          <p class="muted">${esc(WEEKDAYS[new Date(`${upcoming.date}T00:00:00Z`).getUTCDay()])}, ${esc(formatShort(upcoming.date))}${p.gym_start ? ` · ${esc(p.gym_start.slice(0, 5))}` : ''}</p>
          <p class="small muted">${esc(upcoming.focus)}</p>` : '<p class="muted">No workouts scheduled in the next two weeks. <a href="#/settings">Edit your schedule</a>.</p>'}
      </div>
    </section>

    <section class="grid g2">
      <div class="card">
        <div class="card-head"><h3>${icon('bar-chart-3')} Weekly attendance</h3><a class="btn btn-sm btn-ghost" href="#/streaks">Details</a></div>
        ${weeks.some((w) => w.completed) ? '<div style="height:200px"><canvas id="att"></canvas></div>'
          : emptyState('bar-chart-3', 'No workouts yet', 'Each completed workout adds to this chart.')}
      </div>
      <div class="card">
        <div class="card-head"><h3>${icon('medal')} Personal records</h3></div>
        ${prs.length ? `<div class="list">${prs.map((r) => `<div class="list-item"><div class="grow"><strong class="truncate">${esc(r.exercise_name)}</strong>
            <div class="small muted">${esc(prLabel(r, unit))} · ${esc(formatShort(r.achieved_on))}</div></div><span class="badge badge-lime">PR</span></div>`).join('')}</div>`
          : emptyState('medal', 'No records yet', 'Your first session sets a baseline. Beat it next time to earn a PR.')}
      </div>
    </section>

    <section class="grid g2">
      <div class="card">
        <div class="card-head"><h3>${icon('trending-up')} Strength improvements</h3><a class="btn btn-sm btn-ghost" href="#/progress">Charts</a></div>
        ${improvements.length ? `<div class="list">${improvements.map((x) => `<div class="list-item"><div class="grow"><strong>${esc(x.name)}</strong>
            <div class="small muted">Est. 1RM ${fmt(toDisplay(x.first, unit), 1)} → ${fmt(toDisplay(x.last, unit), 1)} ${unit}</div></div><span class="num accent-lime">+${Math.round(x.change * 100)}%</span></div>`).join('')}</div>`
          : emptyState('trending-up', 'Not enough data yet', 'After two sessions of the same exercise, strength changes appear here.')}
      </div>
      <div class="card">
        <div class="card-head"><h3>${icon('activity')} Recent activity</h3><a class="btn btn-sm btn-ghost" href="#/history">History</a></div>
        ${sessions.length || measurements.length ? `<div class="list">${recentActivity(sessions, measurements, unit)}</div>`
          : emptyState('activity', 'Nothing logged yet', 'Workouts and measurements you save show up here.')}
      </div>
    </section>
  </div>`;

  root.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
  requestAnimationFrame(() => root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; }));
  const att = root.querySelector('#att');
  if (att) {
    const last = weeks.slice(-8);
    barChart(att, { labels: last.map((w) => `W${w.week}`), data: last.map((w) => w.completed), label: 'Workouts', target, max: Math.max(7, target) });
  }
  return destroyAll;
}

export function prLabel(r, unit) {
  const w = (kg) => `${fmt(toDisplay(kg, unit), 1)} ${unit}`;
  if (r.record_type === 'max_weight') return `Heaviest: ${w(r.value)}${r.reps ? ` × ${r.reps}` : ''}`;
  if (r.record_type === 'est_1rm') return `Est. 1RM: ${w(r.value)}`;
  return `Most reps: ${fmt(r.value)}`;
}

function recentActivity(sessions, measurements, unit) {
  const items = [
    ...sessions.slice(0, 6).map((s) => ({ date: s.session_date, html: `<a class="grow" href="#/history/${esc(s.id)}"><strong>${esc(s.name)}</strong><div class="small muted">Workout completed · ${esc(formatShort(s.session_date))}</div></a>${icon('chevron-right')}` })),
    ...measurements.slice(-4).map((m) => ({ date: m.measured_on, html: `<div class="grow"><strong>Measurements</strong><div class="small muted">${m.weight_kg != null ? `${fmt(toDisplay(m.weight_kg, unit), 1)} ${unit}` : ''}${m.waist_cm != null ? ` · waist ${fmt(m.waist_cm, 1)} cm` : ''} · ${esc(formatShort(m.measured_on))}</div></div>` })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return items.map((i) => `<div class="list-item">${i.html}</div>`).join('');
}
