// Nutrition math. All food values are estimates and labelled as such in the UI.
import { minutesToLabel, timeToMinutes } from './dates.js';

const r1 = (n) => Math.round(n * 10) / 10;

export function scaleFood(food, servings) {
  const s = Number(servings);
  if (!(s > 0)) throw new Error('Servings must be more than 0');
  return {
    kcal: r1(food.kcal * s), protein_g: r1(food.protein_g * s),
    carbs_g: r1(food.carbs_g * s), fat_g: r1(food.fat_g * s),
  };
}

export function totals(entries) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const e of entries) for (const k of Object.keys(t)) t[k] += Number(e[k]) || 0;
  for (const k of Object.keys(t)) t[k] = r1(t[k]);
  return t;
}

export const sumWater = (rows) => rows.reduce((a, r) => a + (Number(r.amount_ml) || 0), 0);

export function proteinGap(consumed, targetMin) {
  return { consumed: r1(consumed), remaining: Math.max(0, r1(targetMin - consumed)), met: consumed >= targetMin };
}

/** Foods that close a protein gap efficiently: high protein per serving, then per kcal. */
export function proteinSuggestions(foods, remaining, limit = 5) {
  return foods
    .filter((f) => f.protein_g >= 5)
    .map((f) => ({ ...f, servingsNeeded: remaining > 0 ? Math.min(3, Math.ceil((remaining / f.protein_g) * 2) / 2) : 0, density: f.protein_g / Math.max(f.kcal, 1) }))
    .sort((a, b) => b.density - a.density)
    .slice(0, limit);
}

/** Meal timing built around the gym window. */
export function mealSchedule(gymStart = '16:30', gymEnd = '18:00') {
  const s = timeToMinutes(gymStart), e = timeToMinutes(gymEnd);
  return [
    { meal: 'morning', label: 'Morning meal', time: '7:00 AM – 8:30 AM', idea: '4 eggs or 150 g chicken, plus oats, bread or idli and fruit.' },
    { meal: 'mid_morning', label: 'Mid-morning snack', time: '10:30 AM – 11:00 AM', idea: 'Banana with milk or curd, or roasted chana.' },
    { meal: 'lunch', label: 'Lunch', time: '1:00 PM – 2:00 PM', idea: 'Rice or chapati with 150 g chicken or fish, or dal, paneer or tofu, plus vegetables.' },
    { meal: 'pre_workout', label: 'Pre-workout snack', time: `${minutesToLabel(s - 45)} – ${minutesToLabel(s - 15)}`, idea: 'Banana and yogurt, bread with peanut butter, or oats with milk.' },
    { meal: 'post_workout', label: 'Post-workout meal', time: `${minutesToLabel(e + 30)} – ${minutesToLabel(e + 90)}`, idea: 'Chicken, fish, eggs, paneer or tofu with rice, chapati or potatoes and vegetables.' },
    { meal: 'evening', label: 'Evening snack (optional)', time: `${minutesToLabel(e + 180)} – ${minutesToLabel(e + 240)}`, idea: 'Greek yogurt, milk, or eggs if protein is still short.' },
  ];
}

export const MEALS = {
  morning: 'Morning', mid_morning: 'Mid-morning', lunch: 'Lunch', pre_workout: 'Pre-workout',
  post_workout: 'Post-workout', evening: 'Evening', other: 'Other',
};
