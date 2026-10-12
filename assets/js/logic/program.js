// The 24-week program phases.
import { diffDays, addDays } from './dates.js';

export const PHASES = [
  { name: 'Foundation', from: 1, to: 4, focus: 'Technique and routine', look: 'Repeatable sessions with no persistent pain.' },
  { name: 'Build', from: 5, to: 8, focus: 'Consistency and progressive overload', look: 'Better reps or loads with the same technique.' },
  { name: 'Progress', from: 9, to: 16, focus: 'Strength, nutrition and recovery', look: 'Strength trending upward, energy manageable.' },
  { name: 'Refine', from: 17, to: 20, focus: 'Adjust based on recorded trends', look: 'Good recovery and sustainable habits.' },
  { name: 'Finish Strong', from: 21, to: 24, focus: 'Review progress and keep consistent', look: 'Compare photos, waist, lifts and confidence.' },
];

export function programStatus(start, today, weeks = 24) {
  const d = diffDays(today, start);
  if (d < 0) return { state: 'upcoming', week: 0, daysUntil: -d, phase: PHASES[0], end: addDays(start, weeks * 7 - 1) };
  const week = Math.floor(d / 7) + 1;
  if (week > weeks) return { state: 'finished', week: weeks, phase: PHASES[PHASES.length - 1], end: addDays(start, weeks * 7 - 1) };
  return { state: 'active', week, day: (d % 7) + 1, phase: phaseFor(week), end: addDays(start, weeks * 7 - 1), pct: d / (weeks * 7) };
}

export const phaseFor = (week) => PHASES.find((p) => week >= p.from && week <= p.to) || PHASES[PHASES.length - 1];
