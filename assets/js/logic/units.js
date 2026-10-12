// Weights are always stored in kg; converted only for display and input.
export const LB_PER_KG = 2.20462;
export const toDisplay = (kg, unit) => (kg == null || kg === '' ? '' : unit === 'lb' ? Math.round(kg * LB_PER_KG * 10) / 10 : Math.round(kg * 100) / 100);
export const toKg = (value, unit) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return unit === 'lb' ? Math.round((n / LB_PER_KG) * 100) / 100 : Math.round(n * 100) / 100;
};
