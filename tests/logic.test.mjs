// Unit tests for the pure logic. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoInTz, weekdayOf, addDays } from '../assets/js/logic/dates.js';
import { planForDate, templateIdForDate, dayStatus, rescheduleWarnings, completionKey } from '../assets/js/logic/schedule.js';
import { computeStreaks, weeklyCounts, earnedAchievements, monthlyConsistency } from '../assets/js/logic/streaks.js';
import { suggestProgression } from '../assets/js/logic/progression.js';
import { detectPRs, sessionStats, estimate1RM } from '../assets/js/logic/records.js';
import { totals, scaleFood, proteinGap, mealSchedule } from '../assets/js/logic/nutrition.js';
import { programStatus } from '../assets/js/logic/program.js';
import { toKg, toDisplay } from '../assets/js/logic/units.js';

const T = {
  push: { id: 'push', name: 'Push Day', muscle_tags: ['chest', 'shoulders', 'triceps'] },
  pull: { id: 'pull', name: 'Pull Day + Abs', muscle_tags: ['back', 'biceps', 'core'] },
  legs: { id: 'legs', name: 'Legs', muscle_tags: ['legs'] },
  upper: { id: 'upper', name: 'Upper Body + Abs', muscle_tags: ['chest', 'back', 'core'] },
  lower: { id: 'lower', name: 'Lower Body', muscle_tags: ['legs'] },
};
const sched = (from) => [
  [6, 'push'], [0, 'pull'], [1, 'legs'], [2, 'upper'], [3, 'lower'], [4, null], [5, null],
].map(([weekday, template_id]) => ({ weekday, template_id, effective_from: from }));
const ctx = (overrides = []) => ({ scheduleRows: sched('2026-10-01'), templatesById: T, overrides });

test('Qatar date is used, not device time (21:30 UTC is next day in Doha)', () => {
  assert.equal(isoInTz(new Date('2026-10-09T21:30:00Z'), 'Asia/Qatar'), '2026-10-10');
  assert.equal(isoInTz(new Date('2026-10-09T20:59:00Z'), 'Asia/Qatar'), '2026-10-09');
});

test('correct workout for each weekday; Thursday and Friday are rest', () => {
  // 2026-10-10 is a Saturday
  assert.equal(weekdayOf('2026-10-10'), 6);
  const names = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
    .map((d) => planForDate(d, ctx()).map((i) => i.name).join() || 'REST');
  assert.deepEqual(names, ['Push Day', 'Pull Day + Abs', 'Legs', 'Upper Body + Abs', 'Lower Body', 'REST', 'REST']);
});

test('schedule changes keep history', () => {
  const rows = [...sched('2026-10-01'), { weekday: 4, template_id: 'legs', effective_from: '2026-10-20' }];
  assert.equal(templateIdForDate(rows, '2026-10-15'), null);   // old Thursday: rest
  assert.equal(templateIdForDate(rows, '2026-10-22'), 'legs'); // new Thursday: legs
});

test('reschedule moves the workout; skip marks it', () => {
  const ov = [{ scheduled_date: '2026-10-10', template_name: 'Push Day', template_id: 'push', status: 'rescheduled', rescheduled_to: '2026-10-15' }];
  assert.equal(planForDate('2026-10-10', ctx(ov))[0].status, 'rescheduled');
  const moved = planForDate('2026-10-15', ctx(ov));
  assert.equal(moved[0].name, 'Push Day');
  assert.equal(moved[0].plannedDate, '2026-10-10');
});

test('reschedule warns about back-to-back muscle groups', () => {
  // Moving Lower Body to Tuesday sits next to Monday Legs
  const w = rescheduleWarnings('2026-10-13', T.lower, ctx());
  assert.ok(w.some((x) => x.includes('Legs')));
});

test('streak: rest days do not break, misses do, duplicates do not double count, today pending is ok', () => {
  const s = (d, name) => ({ session_date: d, planned_date: d, name, status: 'completed' });
  const sessions = [s('2026-10-10', 'Push Day'), s('2026-10-11', 'Pull Day + Abs'), s('2026-10-12', 'Legs'),
    s('2026-10-13', 'Upper Body + Abs'), s('2026-10-14', 'Lower Body'), s('2026-10-14', 'Lower Body') /* duplicate */,
    s('2026-10-17', 'Push Day')];
  // through Sunday 18th (today, not yet done)
  let r = computeStreaks({ start: '2026-10-10', today: '2026-10-18', ctx: ctx(), sessions });
  assert.equal(r.current, 6); // Thu/Fri rest did not break
  assert.equal(r.longest, 6);
  // Monday 19th missed, evaluated on Tuesday 20th
  r = computeStreaks({ start: '2026-10-10', today: '2026-10-20', ctx: ctx(), sessions });
  assert.equal(r.current, 0);
  assert.equal(r.missed, 2);
  assert.equal(r.longest, 6);
});

test('streak ignores unfinished workouts', () => {
  const sessions = [{ session_date: '2026-10-10', planned_date: '2026-10-10', name: 'Push Day', status: 'in_progress' }];
  const r = computeStreaks({ start: '2026-10-10', today: '2026-10-11', ctx: ctx(), sessions });
  assert.equal(r.current, 0);
  assert.equal(r.total, 0);
});

test('day status distinguishes rest from missed', () => {
  const keys = new Set([completionKey('2026-10-10', 'Push Day')]);
  const st = (d) => dayStatus(d, '2026-10-16', planForDate(d, ctx()), keys, new Set(['2026-10-10']));
  assert.equal(st('2026-10-10'), 'completed');
  assert.equal(st('2026-10-11'), 'missed');
  assert.equal(st('2026-10-15'), 'rest');
});

test('weekly counts and achievements', () => {
  const sessions = Array.from({ length: 5 }, (_, i) => ({ session_date: addDays('2026-10-10', i) }));
  const wc = weeklyCounts({ start: '2026-10-10', today: '2026-10-16', sessions });
  assert.equal(wc[0].completed, 5);
  const a = earnedAchievements({ total: 5, weekCounts: wc, weeklyTarget: 5, prCount: 0 });
  assert.deepEqual(a, ['first_workout', 'first_week']);
});

test('monthly consistency', () => {
  const sessions = [{ session_date: '2026-10-10', planned_date: '2026-10-10', name: 'Push Day' }];
  const m = monthlyConsistency({ start: '2026-10-10', today: '2026-10-12', ctx: ctx(), sessions });
  assert.equal(m[0].scheduled, 2); // Sat done, Sun missed; Mon (today) pending excluded
  assert.equal(m[0].completed, 1);
});

test('progression: increase only when all sets hit the top of the range', () => {
  const ex = { name: 'Incline Dumbbell Press', load_increment_kg: 2 };
  const h = (reps, w = 20) => ({ target_sets: 3, rep_min: 8, rep_max: 12, sets: reps.map((r) => ({ weight_kg: w, reps: r, completed: true })) });
  assert.equal(suggestProgression(ex, [h([12, 12, 12])]).kind, 'increase');
  assert.equal(suggestProgression(ex, [h([12, 12, 12])]).suggested_weight_kg, 22);
  assert.equal(suggestProgression(ex, [h([12, 11, 10])]).kind, 'hold');
  assert.match(suggestProgression(ex, [h([9, 7, 6])]).message, /build reps/);
  assert.equal(suggestProgression(ex, [h([12, 12])]).kind, 'hold'); // not all sets done
  // two consecutive drops
  assert.equal(suggestProgression(ex, [h([8, 8, 8], 20), h([10, 10, 10], 20), h([12, 12, 12], 20)]).kind, 'recovery_check');
});

test('personal records need a previous baseline', () => {
  const sets = [{ weight_kg: 42.5, reps: 8, completed: true }];
  assert.deepEqual(detectPRs(sets, null), []);
  const prs = detectPRs(sets, { max_weight: 40, est_1rm: 50, max_reps: 10 });
  assert.deepEqual(prs.map((p) => p.record_type), ['max_weight', 'est_1rm']);
  assert.equal(Math.round(estimate1RM(42.5, 8) * 10) / 10, 53.8);
});

test('session stats count only completed sets', () => {
  const st = sessionStats([{ sets: [{ weight_kg: 20, reps: 10, completed: true }, { weight_kg: 20, reps: 10, completed: false }] }]);
  assert.deepEqual(st, { sets: 1, reps: 10, volume: 200, exercisesDone: 1 });
});

test('nutrition totals and protein gap', () => {
  const egg = { kcal: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8 };
  const four = scaleFood(egg, 4);
  assert.equal(four.protein_g, 25.2);
  const chicken = scaleFood({ kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 }, 1.5);
  const t = totals([four, chicken]);
  assert.equal(t.protein_g, 71.7);
  assert.equal(t.kcal, 535.5);
  assert.deepEqual(proteinGap(71.7, 140), { consumed: 71.7, remaining: 68.3, met: false });
  assert.throws(() => scaleFood(egg, 0));
  assert.equal(mealSchedule('16:30', '18:00')[3].time, '3:45 PM – 4:15 PM');
});

test('program week and phases', () => {
  assert.equal(programStatus('2026-10-10', '2026-10-10').week, 1);
  assert.equal(programStatus('2026-10-10', '2026-12-05').phase.name, 'Progress'); // week 9
  assert.equal(programStatus('2026-10-10', '2026-10-01').state, 'upcoming');
});

test('units round-trip', () => {
  assert.equal(toKg(100, 'lb'), 45.36);
  assert.equal(toDisplay(45.36, 'lb'), 100);
  assert.ok(Number.isNaN(toKg('-5', 'kg')));
});

// ---------------- planner ----------------
import { rotateSlots, fitToTime, personalPace, completionCap, exerciseMinutes, sessionBudget } from '../assets/js/logic/planner.js';

const LIB = [
  { id: 'bb', name: 'Bench Press', variation_group: 'flat-press', priority: 1, rep_min: 6, rep_max: 10 },
  { id: 'db', name: 'Dumbbell Bench Press', variation_group: 'flat-press', priority: 1, rep_min: 8, rep_max: 12 },
  { id: 'mc', name: 'Machine Chest Press', variation_group: 'flat-press', priority: 1, rep_min: 8, rep_max: 12 },
  { id: 'lr', name: 'Lateral Raise', variation_group: 'lateral-raise', priority: 3, rep_min: 12, rep_max: 20 },
  { id: 'cl', name: 'Cable Lateral Raise', variation_group: 'lateral-raise', priority: 3, rep_min: 12, rep_max: 20 },
  { id: 'pl', name: 'Plank', variation_group: 'abs-stability', priority: 3, rep_min: 20, rep_max: 45 },
  { id: 'dbug', name: 'Dead Bug', variation_group: 'abs-stability', priority: 3, rep_min: 8, rep_max: 12 },
];
const slot = (id, extra = {}) => ({ exercise: LIB.find((x) => x.id === id), target_sets: 3, rep_min: 6, rep_max: 10, rest_seconds: 120, ...extra });

test('rotation: barbell bench, then dumbbell bench, then machine, then back', () => {
  const names = [0, 1, 2, 3].map((n) => rotateSlots([slot('bb')], LIB, n)[0].exercise.name);
  assert.deepEqual(names, ['Bench Press', 'Dumbbell Bench Press', 'Machine Chest Press', 'Bench Press']);
});

test('rotation modes: off and accessories-only keep main lifts fixed', () => {
  assert.equal(rotateSlots([slot('bb')], LIB, 1, 'off')[0].exercise.id, 'bb');
  const r = rotateSlots([slot('bb'), slot('lr', { rep_min: 12, rep_max: 20 })], LIB, 1, 'accessories');
  assert.equal(r[0].exercise.id, 'bb');
  assert.equal(r[1].exercise.id, 'cl');
});

test('rotation never repeats an exercise in the same session', () => {
  const r = rotateSlots([slot('bb'), slot('db')], LIB, 1);
  assert.notEqual(r[0].exercise.id, r[1].exercise.id);
});

test('rotation switches to the variation\'s own rep range when ranges do not overlap', () => {
  const r = rotateSlots([slot('dbug', { rep_min: 8, rep_max: 12 })], LIB, 1)[0]; // dead bug -> plank (seconds)
  assert.equal(r.exercise.id, 'pl');
  assert.deepEqual([r.rep_min, r.rep_max], [20, 45]);
});

test('time estimate is realistic', () => {
  assert.equal(exerciseMinutes({ target_sets: 3, rest_seconds: 120 }), 10); // 3 setup + 3 sets + 2 rests of 2 min
});

test('fit to time keeps main lifts and moves accessories to extras', () => {
  const items = [
    { name: 'Bench', priority: 1, target_sets: 3, rest_seconds: 150 },
    { name: 'Incline', priority: 1, target_sets: 3, rest_seconds: 120 },
    { name: 'Shoulder press', priority: 2, target_sets: 2, rest_seconds: 120 },
    { name: 'Lateral', priority: 3, target_sets: 3, rest_seconds: 75 },
    { name: 'Pushdown', priority: 3, target_sets: 3, rest_seconds: 75 },
    { name: 'Fly', priority: 3, target_sets: 2, rest_seconds: 60 },
    { name: 'Overhead ext', priority: 3, target_sets: 2, rest_seconds: 60 },
  ];
  const r = fitToTime(items, 60);
  assert.ok(r.minutes <= 60, `${r.minutes} min`);
  assert.deepEqual(r.main.slice(0, 3).map((x) => x.name), ['Bench', 'Incline', 'Shoulder press']);
  assert.ok(r.extras.length >= 1);
  assert.equal(r.main.length + r.extras.length, 7);
  const big = fitToTime(items, 120);
  assert.equal(big.extras.length, 0);
});

test('fit to time trims an accessory to 2 sets before dropping it', () => {
  const items = [{ name: 'A', priority: 1, target_sets: 3, rest_seconds: 120 }, { name: 'B', priority: 3, target_sets: 3, rest_seconds: 90 }];
  const r = fitToTime(items, 15 + 10 + 7); // room for B only at 2 sets (3+2+1.5=6.5)
  assert.equal(r.main.length, 2);
  assert.equal(r.main[1].target_sets, 2);
  assert.ok(r.main[1].trimmed);
});

test('pace and completion cap learn from real sessions', () => {
  const ex = (done) => ({ target_sets: 3, rest_seconds: 90, done });
  // planned 7, finished 5, took 100 min
  const history = [{ minutes: 100, exercises: [ex(true), ex(true), ex(true), ex(true), ex(true), ex(false), ex(false)] }];
  const pace = personalPace(history);
  assert.ok(pace > 1.5 && pace <= 1.6, String(pace)); // 100 / (15 + 5*9) = 1.67 -> clamped 1.6
  assert.equal(completionCap(history), 5);
  assert.equal(completionCap([{ minutes: 60, exercises: [ex(true), ex(true)] }]), null); // finished everything -> no cap
});

test('session budget uses setting first, then the gym window', () => {
  assert.equal(sessionBudget({ session_minutes: 120 }, { gym_start: '16:30', gym_end: '18:00' }), 120);
  assert.equal(sessionBudget({}, { gym_start: '16:30:00', gym_end: '18:00:00' }), 90);
});
