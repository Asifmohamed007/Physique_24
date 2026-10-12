// Builds today's session from a template: rotated variations, sized to your time.
import { app } from '../app.js';
import { rotateSlots, fitToTime, personalPace, completionCap, sessionBudget } from '../logic/planner.js';

export function buildPlan(template, { sessions = [], history = [] } = {}) {
  const slots = (template?.template_exercises || []).filter((te) => te.exercises).map((te) => ({
    exercise: te.exercises, target_sets: te.target_sets, rep_min: te.rep_min, rep_max: te.rep_max,
    rest_seconds: te.rest_seconds || app.settings.default_rest_seconds, position: te.position,
  }));
  const timesDone = sessions.filter((s) => s.name === template?.name).length;
  const rotated = rotateSlots(slots, app.exercises, timesDone, app.settings.rotation_mode || 'all');
  const budget = sessionBudget(app.settings, app.profile);
  const pace = personalPace(history);
  const cap = completionCap(history);
  return { ...fitToTime(rotated, budget, { pace, cap }), pace, cap, timesDone, total: slots.length };
}

/** Convert a planned item to the shape a session exercise needs. */
export const toSessionExercise = (it) => ({
  id: crypto.randomUUID(), exercise_id: it.exercise.id, exercise_name: it.exercise.name,
  muscle_group: it.exercise.muscle_group, equipment: it.exercise.equipment,
  target_sets: it.target_sets, rep_min: it.rep_min, rep_max: it.rep_max, rest_seconds: it.rest_seconds,
});

const extrasKey = (sessionId) => `fitapp:extras:${sessionId}`;
export function saveExtras(sessionId, extras) {
  try { localStorage.setItem(extrasKey(sessionId), JSON.stringify(extras.map((it) => ({ ...toSessionExercise(it), id: undefined })))); } catch { /* storage full */ }
}
export function readExtras(sessionId) { try { return JSON.parse(localStorage.getItem(extrasKey(sessionId)) || '[]'); } catch { return []; } }
export function writeExtras(sessionId, list) { try { localStorage.setItem(extrasKey(sessionId), JSON.stringify(list)); } catch { /* full */ } }
