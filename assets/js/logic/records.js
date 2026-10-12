// Training math: volume, estimated 1RM and personal-record detection.

/** Epley estimate; only meaningful for sets of 1–15 reps with load. */
export function estimate1RM(weightKg, reps) {
  if (!weightKg || !reps || reps > 15) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export const doneSets = (sets) => sets.filter((s) => s.completed && Number(s.reps) > 0);

export function sessionStats(exercises) {
  let sets = 0, reps = 0, volume = 0, exercisesDone = 0;
  for (const ex of exercises) {
    const d = doneSets(ex.sets || []);
    if (d.length) exercisesDone++;
    sets += d.length;
    for (const s of d) {
      reps += Number(s.reps);
      volume += (Number(s.weight_kg) || 0) * Number(s.reps);
    }
  }
  return { sets, reps, volume: Math.round(volume), exercisesDone };
}

export function bestOf(sets) {
  const d = doneSets(sets);
  if (!d.length) return null;
  return {
    max_weight: Math.max(...d.map((s) => Number(s.weight_kg) || 0)),
    est_1rm: Math.max(...d.map((s) => estimate1RM(Number(s.weight_kg), Number(s.reps)))),
    max_reps: Math.max(...d.map((s) => Number(s.reps))),
  };
}

/**
 * New records compared with all previous history for the exercise.
 * The very first time an exercise is logged sets a baseline, not a PR.
 * Weighted exercises use max_weight and est_1rm; bodyweight ones use max_reps.
 */
export function detectPRs(currentSets, previousBest, isBodyweight = false) {
  const now = bestOf(currentSets);
  if (!now || !previousBest) return [];
  const prs = [];
  const types = isBodyweight || !now.max_weight ? ['max_reps'] : ['max_weight', 'est_1rm'];
  for (const t of types) {
    const prev = Number(previousBest[t]) || 0;
    if (now[t] > 0 && now[t] > prev + 0.01) prs.push({ record_type: t, value: Math.round(now[t] * 100) / 100, previous: prev });
  }
  return prs;
}

/** Merge many sets' bests into one "all-time best" object. */
export function mergeBests(list) {
  const out = { max_weight: 0, est_1rm: 0, max_reps: 0 };
  let any = false;
  for (const b of list) {
    if (!b) continue;
    any = true;
    for (const k of Object.keys(out)) out[k] = Math.max(out[k], Number(b[k]) || 0);
  }
  return any ? out : null;
}
