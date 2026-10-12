// Pure scheduling logic — no database or DOM access, so it can be unit tested.
import { weekdayOf, addDays } from './dates.js';

/**
 * Template id scheduled for a date's weekday. Schedule rows are versioned by
 * effective_from so changing the schedule never rewrites past days.
 * @returns {string|null} template id, or null for a rest day
 */
export function templateIdForDate(scheduleRows, iso) {
  const wd = weekdayOf(iso);
  const rows = scheduleRows.filter((r) => r.weekday === wd)
    .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
  if (!rows.length) return null;
  let pick = rows[0]; // dates before the first version use the earliest schedule
  for (const r of rows) if (r.effective_from <= iso) pick = r;
  return pick.template_id || null;
}

/**
 * Everything planned for a date, after applying skip / reschedule overrides.
 * Each item: { templateId, name, focus, muscleTags, plannedDate, origin, status, override }
 *  - origin 'schedule' = from the weekly split, 'moved' = rescheduled onto this date
 *  - status 'planned' | 'skipped' | 'rescheduled'
 */
export function planForDate(iso, { scheduleRows, templatesById, overrides = [] }) {
  const items = [];
  const tid = templateIdForDate(scheduleRows, iso);
  const tpl = tid ? templatesById[tid] : null;
  if (tpl) {
    const ov = overrides.find((o) => o.scheduled_date === iso && o.template_name === tpl.name);
    items.push(makeItem(tpl, iso, 'schedule', ov && ['skipped', 'rescheduled'].includes(ov.status) ? ov.status : 'planned', ov));
  }
  for (const ov of overrides) {
    if (ov.status === 'rescheduled' && ov.rescheduled_to === iso) {
      const t = templatesById[ov.template_id] || { id: ov.template_id, name: ov.template_name, focus: '', muscle_tags: [] };
      const moved = overrides.find((o) => o.scheduled_date === iso && o.template_name === t.name && o.status === 'skipped');
      items.push(makeItem(t, ov.scheduled_date, 'moved', moved ? 'skipped' : 'planned', ov));
    }
  }
  return items;
}

function makeItem(tpl, plannedDate, origin, status, override) {
  return {
    templateId: tpl.id, name: tpl.name, focus: tpl.focus || '', muscleTags: tpl.muscle_tags || [],
    plannedDate, origin, status, override: override || null,
  };
}

export const completionKey = (plannedDate, name) => `${plannedDate}|${name}`;

/**
 * Status for one day, for calendars.
 * 'rest' | 'completed' | 'missed' | 'skipped' | 'rescheduled' | 'today' | 'planned' | 'extra'
 */
export function dayStatus(iso, today, items, completedKeys, completedDates) {
  const active = items.filter((i) => i.status === 'planned');
  if (active.length) {
    const done = active.every((i) => completedKeys.has(completionKey(i.plannedDate, i.name)));
    if (done) return 'completed';
    if (iso < today) return 'missed';
    return iso === today ? 'today' : 'planned';
  }
  if (items.some((i) => i.status === 'skipped')) return 'skipped';
  if (items.some((i) => i.status === 'rescheduled')) return 'rescheduled';
  return completedDates.has(iso) ? 'extra' : 'rest';
}

/**
 * Warn before rescheduling into a slot that would stack the same muscles on
 * consecutive days, or double up a day. Returns a list of plain-language warnings.
 */
export function rescheduleWarnings(targetIso, template, ctx) {
  const warnings = [];
  const tags = new Set(template.muscle_tags || []);
  const same = planForDate(targetIso, ctx).filter((i) => i.status === 'planned');
  if (same.length) warnings.push(`${targetIso} already has ${same.map((i) => i.name).join(', ')} planned.`);
  for (const offset of [-1, 1]) {
    const d = addDays(targetIso, offset);
    for (const i of planForDate(d, ctx)) {
      if (i.status !== 'planned' || i.name === template.name) continue;
      const overlap = i.muscleTags.filter((t) => tags.has(t));
      if (overlap.length) warnings.push(`${i.name} on ${d} also trains ${overlap.join(', ')} — back-to-back sessions limit recovery.`);
    }
  }
  return warnings;
}
