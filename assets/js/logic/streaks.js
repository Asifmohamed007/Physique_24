// Streaks and consistency. Pure functions, unit tested in tests/logic.test.mjs.
import { rangeDays, diffDays, addDays } from './dates.js';
import { planForDate, completionKey } from './schedule.js';

export const STREAK_EXPLANATION =
  'Your streak counts scheduled workouts completed in a row. Rest days never break it. ' +
  'Rescheduling moves the workout to its new day. A scheduled workout that passes without being ' +
  'completed (or that you skip) starts the count again. Only workouts you finish and save are counted, ' +
  'and each scheduled workout can only be counted once.';

/**
 * @param {object} p
 * @param {string} p.start   program start date
 * @param {string} p.today   today in the user's timezone
 * @param {object} p.ctx     { scheduleRows, templatesById, overrides }
 * @param {Array}  p.sessions completed sessions [{ session_date, planned_date, name }]
 */
export function computeStreaks({ start, today, ctx, sessions }) {
  const completed = sessions.filter((s) => s.status === undefined || s.status === 'completed');
  const keys = new Set(completed.filter((s) => s.planned_date).map((s) => completionKey(s.planned_date, s.name)));
  let current = 0, longest = 0, scheduled = 0, missed = 0, skipped = 0, rescheduled = 0;
  if (start > today) return { current, longest, total: completed.length, scheduled, missed, skipped, rescheduled };

  for (const d of rangeDays(start, today)) {
    for (const item of planForDate(d, ctx)) {
      if (item.status === 'rescheduled') { rescheduled++; continue; } // neutral; judged on its new day
      scheduled++;
      const done = item.status === 'planned' && keys.has(completionKey(item.plannedDate, item.name));
      if (done) {
        current++;
        longest = Math.max(longest, current);
      } else if (d === today && item.status === 'planned') {
        // still time to train today — not a miss yet
        scheduled--;
      } else {
        if (item.status === 'skipped') skipped++; else missed++;
        current = 0;
      }
    }
  }
  return { current, longest, total: completed.length, scheduled, missed, skipped, rescheduled };
}

/** Program week number (1-based) for a date. */
export const programWeekOf = (start, iso) => Math.floor(diffDays(iso, start) / 7) + 1;

/** Completed workouts per program week, up to the current week. */
export function weeklyCounts({ start, today, sessions, weeks = 24 }) {
  const current = Math.min(Math.max(programWeekOf(start, today), 1), weeks);
  const counts = Array.from({ length: current }, (_, i) => ({ week: i + 1, from: addDays(start, i * 7), completed: 0 }));
  for (const s of sessions) {
    const w = programWeekOf(start, s.session_date);
    if (w >= 1 && w <= current) counts[w - 1].completed++;
  }
  return counts;
}

/** Longest run of consecutive full weeks meeting the target (current partial week excluded). */
export function consistentWeekRun(counts, target, includeLast = false) {
  let run = 0, best = 0;
  const list = includeLast ? counts : counts.slice(0, -1);
  for (const c of list) {
    if (c.completed >= target) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/** Completion rate per calendar month: completed / scheduled (excluding today's pending). */
export function monthlyConsistency({ start, today, ctx, sessions }) {
  const keys = new Set(sessions.filter((s) => s.planned_date).map((s) => completionKey(s.planned_date, s.name)));
  const months = {};
  if (start > today) return [];
  for (const d of rangeDays(start, today)) {
    const m = d.slice(0, 7);
    months[m] ||= { month: m, scheduled: 0, completed: 0 };
    for (const item of planForDate(d, ctx)) {
      if (item.status === 'rescheduled') continue;
      const done = item.status === 'planned' && keys.has(completionKey(item.plannedDate, item.name));
      if (d === today && !done) continue;
      months[m].scheduled++;
      if (done) months[m].completed++;
    }
  }
  return Object.values(months).map((m) => ({ ...m, rate: m.scheduled ? m.completed / m.scheduled : null }));
}

/** Which achievement codes the user has earned from their records. */
export function earnedAchievements({ total, weekCounts, weeklyTarget, prCount }) {
  const earned = [];
  if (total >= 1) earned.push('first_workout');
  if (weekCounts.some((w) => w.completed >= weeklyTarget)) earned.push('first_week');
  for (const n of [10, 25, 50, 100]) if (total >= n) earned.push(`workouts_${n}`);
  if (consistentWeekRun(weekCounts, weeklyTarget, true) >= 4) earned.push('consistent_4');
  if (prCount >= 1) earned.push('first_pr');
  return earned;
}
