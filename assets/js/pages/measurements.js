import { app, subnav, rerender } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, toast, confirmDialog, emptyState, formData, clearErrors, fieldError } from '../core/ui.js';
import { formatShort, addDays } from '../logic/dates.js';
import { toDisplay, toKg } from '../logic/units.js';

const FIELDS = [
  ['waist_cm', 'Waist', 'cm', 30, 250], ['chest_cm', 'Chest', 'cm', 40, 250], ['shoulders_cm', 'Shoulders', 'cm', 40, 250],
  ['arms_cm', 'Arms', 'cm', 10, 80], ['thighs_cm', 'Thighs', 'cm', 20, 120], ['hips_cm', 'Hips (optional)', 'cm', 40, 250],
];

export async function render(root) {
  const unit = app.unit();
  const rows = await api.loadMeasurements();
  const today = app.today();
  const existing = rows.find((r) => r.measured_on === today);
  const latest = [...rows].reverse();
  const weekAgo = rows.filter((r) => r.weight_kg != null && r.measured_on > addDays(today, -7));
  const avg7 = weekAgo.length ? weekAgo.reduce((a, r) => a + Number(r.weight_kg), 0) / weekAgo.length : null;

  root.innerHTML = `${subnav('measurements')}
  <div class="grid g2">
    <form class="card" id="mform" novalidate>
      <h3>${icon('ruler')} ${existing ? 'Update' : 'Log'} measurements</h3>
      <p class="small muted">Weigh in the morning after the bathroom. Measure the waist at the navel, relaxed. Weekly is plenty for tape measurements.</p>
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="measured_on" value="${today}" max="${today}" required></label>
        <label class="field"><span>Weight (${unit})</span><input type="number" inputmode="decimal" step="0.1" name="weight" value="${existing?.weight_kg != null ? toDisplay(existing.weight_kg, unit) : ''}"></label>
        ${FIELDS.map(([k, l, u, min, max]) => `<label class="field"><span>${l} (${u})</span><input type="number" inputmode="decimal" step="0.1" min="${min}" max="${max}" name="${k}" value="${existing?.[k] ?? ''}"></label>`).join('')}
        <label class="field"><span>Sleep (hours)</span><input type="number" inputmode="decimal" step="0.5" min="0" max="24" name="sleep_hours" value="${existing?.sleep_hours ?? ''}"></label>
        <label class="field"><span>Energy (1–5)</span><select name="energy"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${existing?.energy === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <label class="field" style="margin-top:12px"><span>Notes</span><textarea name="notes" maxlength="1000">${esc(existing?.notes || '')}</textarea></label>
      <button class="btn btn-primary" style="margin-top:14px" type="submit">${icon('save')} Save measurements</button>
    </form>
    <div class="card">
      <h3>${icon('scale')} Latest</h3>
      ${rows.length ? `<div class="grid g2">
        <div class="stat"><span class="label">7-day avg weight</span><span class="num">${avg7 != null ? `${fmt(toDisplay(avg7, unit), 1)}<small>${unit}</small>` : '—'}</span></div>
        ${FIELDS.slice(0, 5).map(([k, l]) => { const r = latest.find((x) => x[k] != null); return `<div class="stat"><span class="label">${l}</span><span class="num">${r ? `${fmt(r[k], 1)}<small>cm</small>` : '—'}</span></div>`; }).join('')}
      </div><a class="btn btn-ghost btn-sm" style="margin-top:12px" href="#/progress">${icon('line-chart')} See trends</a>`
      : emptyState('ruler', 'No measurements yet', 'Your first entry is your baseline. Starting stats from your plan: about 180 cm and 73.4 kg — update them if they have changed.')}
    </div>
  </div>
  <div class="card section-gap"><h3>History</h3>
    ${rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Weight</th>${FIELDS.map(([, l]) => `<th>${l.replace(' (optional)', '')}</th>`).join('')}<th>Sleep</th><th>Energy</th><th></th></tr></thead><tbody>
    ${latest.map((r) => `<tr><td>${esc(formatShort(r.measured_on))}</td><td>${r.weight_kg != null ? fmt(toDisplay(r.weight_kg, unit), 1) : '—'}</td>${FIELDS.map(([k]) => `<td>${r[k] != null ? fmt(r[k], 1) : '—'}</td>`).join('')}
      <td>${r.sleep_hours ?? '—'}</td><td>${r.energy ?? '—'}</td><td><button class="icon-btn" data-del="${esc(r.id)}" aria-label="Delete entry">${icon('trash-2')}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Entries appear here once saved.</p>'}
  </div>`;

  root.querySelector('#mform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const v = formData(form);
    const row = { measured_on: v.measured_on, notes: v.notes, sleep_hours: v.sleep_hours, energy: v.energy ? Number(v.energy) : null };
    if (!v.measured_on || v.measured_on > today) return fieldError(form, 'measured_on', 'Choose today or an earlier date.');
    if (v.weight != null) {
      const kg = toKg(v.weight, unit);
      if (!(kg >= 25 && kg <= 350)) return fieldError(form, 'weight', `Enter a weight between ${toDisplay(25, unit)} and ${toDisplay(350, unit)} ${unit}.`);
      row.weight_kg = kg;
    } else row.weight_kg = null;
    for (const [k, l, , min, max] of FIELDS) {
      if (v[k] != null && (v[k] < min || v[k] > max)) return fieldError(form, k, `${l} should be between ${min} and ${max} cm.`);
      row[k] = v[k];
    }
    if (row.sleep_hours != null && (row.sleep_hours < 0 || row.sleep_hours > 24)) return fieldError(form, 'sleep_hours', 'Between 0 and 24 hours.');
    if (Object.entries(row).every(([k, val]) => k === 'measured_on' || val == null || val === '')) return fieldError(form, 'weight', 'Enter at least one measurement.');
    // back-dated entry on a day that already has data: fill blanks from what's stored instead of erasing it
    const prevRow = rows.find((r) => r.measured_on === row.measured_on);
    if (prevRow && row.measured_on !== today) for (const k of Object.keys(row)) if (row[k] == null || row[k] === '') row[k] = prevRow[k];
    const btn = form.querySelector('[type=submit]');
    btn.setAttribute('aria-busy', 'true');
    try { await api.saveMeasurement(row); toast('Measurements saved', 'success'); rerender(); } catch (err) { btn.removeAttribute('aria-busy'); toast(err.message, 'error'); }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!(await confirmDialog('Delete this measurement entry?', { confirmLabel: 'Delete', danger: true }))) return;
    try { await api.deleteMeasurement(b.dataset.del); rerender(); } catch (err) { toast(err.message, 'error'); }
  });
}
