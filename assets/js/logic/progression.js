// Conservative, exercise-specific progressive-overload suggestions.
// Suggestions are never applied automatically — the user accepts, edits or rejects.
import { doneSets, bestOf } from './records.js';

const roundTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/**
 * @param {object} exercise  { name, load_increment_kg, equipment }
 * @param {Array} history    newest first: [{ target_sets, rep_min, rep_max, sets: [{weight_kg, reps, completed}] }]
 * @returns {{kind, message, current_weight_kg, suggested_weight_kg}|null}
 */
export function suggestProgression(exercise, history) {
  if (!history.length) return null;
  const last = history[0];
  const sets = doneSets(last.sets || []);
  if (!sets.length) return null;

  // Recovery check: best estimated strength dropped in two sessions in a row by > 3% overall
  if (history.length >= 3) {
    const e = history.slice(0, 3).map((h) => bestOf(h.sets || [])?.est_1rm || 0);
    if (e.every((x) => x > 0) && e[0] < e[1] && e[1] < e[2] && e[0] < e[2] * 0.97) {
      return {
        kind: 'recovery_check',
        message: `${exercise.name} has dropped two sessions in a row. Before changing anything, check sleep, food intake, stress and recovery. Keep the load the same next time.`,
        current_weight_kg: maxWeight(sets), suggested_weight_kg: maxWeight(sets),
      };
    }
  }

  const weight = maxWeight(sets);
  const inc = Number(exercise.load_increment_kg) || 0;
  const topSets = sets.filter((s) => (Number(s.weight_kg) || 0) === weight);
  const allSetsDone = sets.length >= last.target_sets;
  const allAtTop = allSetsDone && sets.slice(0, last.target_sets).every((s) => Number(s.reps) >= last.rep_max)
    && topSets.length >= last.target_sets;

  if (allAtTop) {
    if (!inc || !weight) {
      return { kind: 'increase', message: `You reached ${last.rep_max} reps on every set. Try a slightly harder variation or slower reps next time.`, current_weight_kg: weight || null, suggested_weight_kg: weight || null };
    }
    const next = roundTo(weight + inc, inc);
    return {
      kind: 'increase',
      message: `All ${last.target_sets} sets reached ${last.rep_max} reps at ${fmt(weight)} kg. If technique stayed clean, try ${fmt(next)} kg and aim for ${last.rep_min}+ reps.`,
      current_weight_kg: weight, suggested_weight_kg: next,
    };
  }
  if (!allSetsDone) {
    return { kind: 'hold', message: `Keep ${fmt(weight)} kg and complete all ${last.target_sets} sets before adding load.`, current_weight_kg: weight, suggested_weight_kg: weight };
  }
  const below = sets.some((s) => Number(s.reps) < last.rep_min);
  return {
    kind: 'hold',
    message: below
      ? `Some sets fell under ${last.rep_min} reps. Keep ${fmt(weight)} kg and build reps with good form.`
      : `Keep ${fmt(weight)} kg and add a rep where you can until every set reaches ${last.rep_max}.`,
    current_weight_kg: weight, suggested_weight_kg: weight,
  };
}

const maxWeight = (sets) => Math.max(...sets.map((s) => Number(s.weight_kg) || 0));
const fmt = (n) => String(Math.round(n * 100) / 100);
