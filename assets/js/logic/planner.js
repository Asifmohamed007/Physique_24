// Session planner: rotates exercise variations between sessions and sizes
// each workout to the time you have, learning from what you actually finish.
// Pure functions — unit tested in tests/logic.test.mjs.

export const PLAN = {
  warmup: 10,      // minutes: general warm-up + ramp-up sets
  cooldown: 5,     // minutes
  transition: 3,   // minutes per exercise: walk over, set up, first ramp set
  setWork: 1,      // minutes per working set
};

/** Realistic minutes for one exercise (rest between sets, not after the last). */
export function exerciseMinutes({ target_sets, rest_seconds }) {
  const sets = Number(target_sets) || 0;
  return PLAN.transition + sets * PLAN.setWork + Math.max(0, sets - 1) * ((Number(rest_seconds) || 90) / 60);
}

/**
 * Pick today's variation for each template slot.
 * Each slot cycles through its variation group: session 1 = the template's
 * exercise, session 2 = the next variation, and so on.
 * @param slots     [{ exercise, target_sets, rep_min, rep_max, rest_seconds, position }]
 * @param library   all exercises (with variation_group, priority)
 * @param timesDone how many times this workout has been completed before
 * @param mode      'all' | 'accessories' (main lifts stay fixed) | 'off'
 */
export function rotateSlots(slots, library, timesDone = 0, mode = 'all') {
  const used = new Set();
  return slots.map((slot) => {
    const base = slot.exercise;
    let pick = base, variant = 1, of = 1;
    const fixed = mode === 'off' || !base.variation_group || (mode === 'accessories' && base.priority === 1);
    if (!fixed) {
      const others = library
        .filter((x) => x.variation_group === base.variation_group && x.id !== base.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const members = [base, ...others];
      of = members.length;
      for (let k = 0; k < members.length; k++) {
        const cand = members[(timesDone + k) % members.length];
        if (!used.has(cand.id)) { pick = cand; variant = ((timesDone + k) % members.length) + 1; break; }
      }
    }
    used.add(pick.id);
    // keep the slot's prescription unless the variation uses a different kind of range (e.g. seconds)
    const overlap = pick.rep_min <= slot.rep_max && pick.rep_max >= slot.rep_min;
    return {
      ...slot, exercise: pick, base, variant, of, rotated: pick.id !== base.id,
      rep_min: overlap ? slot.rep_min : pick.rep_min, rep_max: overlap ? slot.rep_max : pick.rep_max,
      priority: pick.priority ?? base.priority ?? 2,
    };
  });
}

/**
 * How long you actually take compared with the estimate, from recent sessions.
 * history: [{ minutes, exercises: [{ target_sets, rest_seconds, done }] }]
 * Returns a factor (1 = on estimate, 1.3 = 30% slower). Default 1.
 */
export function personalPace(history) {
  const ratios = [];
  for (const h of history) {
    const done = h.exercises.filter((e) => e.done);
    if (!done.length || !(h.minutes >= 15)) continue;
    const est = PLAN.warmup + PLAN.cooldown + done.reduce((a, e) => a + exerciseMinutes(e), 0);
    ratios.push(Math.min(1.6, Math.max(0.8, h.minutes / est)));
  }
  if (!ratios.length) return 1;
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100;
}

/**
 * If you've recently left exercises unfinished, cap the plan at what you
 * actually complete so the goal stays achievable. Returns a number or null.
 */
export function completionCap(history) {
  const recent = history.filter((h) => h.exercises.length).slice(0, 3);
  if (!recent.some((h) => h.exercises.filter((e) => e.done).length < h.exercises.length)) return null;
  const avgDone = recent.reduce((a, h) => a + h.exercises.filter((e) => e.done).length, 0) / recent.length;
  return Math.max(3, Math.round(avgDone));
}

/**
 * Fit exercises into the time budget. Main lifts are kept first, then
 * secondary, then accessories. An accessory that doesn't fit at 3 sets is
 * tried at 2 sets before it moves to "if you have time".
 * @returns {{ main: [], extras: [], minutes: number, budget: number }}
 */
export function fitToTime(items, budgetMinutes, { pace = 1, cap = null, minKeep = 3 } = {}) {
  const ordered = items.map((it, i) => ({ ...it, _i: i }))
    .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a._i - b._i);
  let total = PLAN.warmup + PLAN.cooldown;
  const main = [], extras = [];
  for (const it of ordered) {
    const fullCost = exerciseMinutes(it) * pace;
    const underCap = cap == null || main.length < cap;
    if (underCap && total + fullCost <= budgetMinutes) { main.push(it); total += fullCost; continue; }
    if (underCap && it.priority === 3 && it.target_sets > 2) {
      const trimmed = { ...it, target_sets: 2, trimmed: true };
      const cost = exerciseMinutes(trimmed) * pace;
      if (total + cost <= budgetMinutes) { main.push(trimmed); total += cost; continue; }
    }
    if (main.length < Math.min(minKeep, items.length)) { main.push(it); total += fullCost; continue; }
    extras.push(it);
  }
  const byPos = (a, b) => a._i - b._i;
  const clean = ({ _i, ...rest }) => rest;
  return { main: main.sort(byPos).map(clean), extras: extras.sort(byPos).map(clean), minutes: Math.round(total), budget: budgetMinutes };
}

/** Time available: the user's setting, or the gym window from the profile. */
export function sessionBudget(settings, profile) {
  if (settings?.session_minutes) return settings.session_minutes;
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const w = toMin(profile?.gym_end) - toMin(profile?.gym_start);
  return w > 0 ? w : 90;
}
