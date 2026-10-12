import { app, subnav, rerender } from '../app.js';
import * as api from '../core/api.js';
import { sb } from '../core/supabase.js';
import { esc, icon, toast, dialog, confirmDialog, formData, clearErrors, fieldError } from '../core/ui.js';
import { templateIdForDate } from '../logic/schedule.js';
import { WEEKDAYS } from '../logic/dates.js';

const TAGS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];
const TZS = ['Asia/Qatar', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Kolkata', 'Asia/Karachi', 'Europe/London', 'UTC'];
const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

export async function render(root) {
  const p = app.profile, s = app.settings, today = app.today();
  const current = Object.fromEntries(ORDER.map((wd) => [wd, templateIdForDate(app.schedule, nextDateFor(today, wd))]));
  const tpOptions = (sel) => `<option value="">Rest day</option>${app.templates.map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;
  const v = (x) => esc(x ?? '');

  root.innerHTML = `${subnav('settings', 'settings')}
  <div class="stack">
    <form class="card" id="profile" novalidate>
      <h3>${icon('user-round')} Profile</h3>
      <div class="form-grid">
        <label class="field"><span>Name</span><input name="full_name" maxlength="120" value="${v(p.full_name)}"></label>
        <label class="field"><span>Location</span><input name="location" maxlength="120" value="${v(p.location)}"></label>
        <label class="field"><span>Profession</span><input name="profession" maxlength="120" value="${v(p.profession)}"></label>
        <label class="field"><span>Timezone</span><select name="timezone">${[...new Set([p.timezone, ...TZS])].map((z) => `<option ${z === p.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label class="field"><span>Height (cm)</span><input type="number" name="height_cm" min="100" max="250" step="0.5" value="${v(p.height_cm)}"></label>
        <label class="field"><span>Age</span><input type="number" name="age_years" min="13" max="100" value="${v(p.age_years)}"></label>
        <label class="field"><span>Program start date</span><input type="date" name="start_date" value="${v(p.start_date)}" required></label>
        <label class="field"><span>Program length (weeks)</span><input type="number" name="program_weeks" min="4" max="104" value="${v(p.program_weeks)}"></label>
        <label class="field"><span>Gym starts</span><input type="time" name="gym_start" value="${v(p.gym_start?.slice(0, 5))}"></label>
        <label class="field"><span>Gym ends</span><input type="time" name="gym_end" value="${v(p.gym_end?.slice(0, 5))}"></label>
        <label class="field" style="grid-column:1/-1"><span>Physique goal</span><textarea name="goal" maxlength="500">${v(p.goal)}</textarea></label>
        <label class="field" style="grid-column:1/-1"><span>Current build & progress</span><input name="current_build" maxlength="200" value="${v(p.current_build)}"></label>
      </div>
      <h3 class="section-gap">${icon('target')} Daily targets <span class="small muted">(starting estimates — review after 2–3 weeks)</span></h3>
      <div class="form-grid">
        <label class="field"><span>Protein min (g)</span><input type="number" name="protein_min_g" min="0" max="500" value="${v(p.protein_min_g)}"></label>
        <label class="field"><span>Protein max (g)</span><input type="number" name="protein_max_g" min="0" max="500" value="${v(p.protein_max_g)}"></label>
        <label class="field"><span>Calories min</span><input type="number" name="kcal_min" min="0" max="8000" value="${v(p.kcal_min)}"></label>
        <label class="field"><span>Calories max</span><input type="number" name="kcal_max" min="0" max="8000" value="${v(p.kcal_max)}"></label>
        <label class="field"><span>Carbs (g)</span><input type="number" name="carbs_g" min="0" max="1000" value="${v(p.carbs_g)}"></label>
        <label class="field"><span>Fat (g)</span><input type="number" name="fat_g" min="0" max="400" value="${v(p.fat_g)}"></label>
        <label class="field"><span>Water (ml)</span><input type="number" name="water_ml" min="0" max="10000" step="250" value="${v(p.water_ml)}"></label>
      </div>
      <p class="small muted">If weight and gym performance both drop for 2–3 weeks, add about 150–200 kcal/day. If weight and waist rise quickly, reduce by the same. Change one thing at a time. These are not medical requirements.</p>
      <button class="btn btn-primary" type="submit">${icon('save')} Save profile</button>
    </form>

    <form class="card" id="prefs">
      <h3>${icon('sliders-horizontal')} App preferences</h3>
      <div class="form-grid">
        <label class="field"><span>Weight unit</span><select name="weight_unit"><option value="kg" ${s.weight_unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option><option value="lb" ${s.weight_unit === 'lb' ? 'selected' : ''}>Pounds (lb)</option></select></label>
        <label class="field"><span>Default rest (seconds)</span><input type="number" name="default_rest_seconds" min="15" max="600" step="15" value="${s.default_rest_seconds}"></label>
        <label class="field"><span>Weekly workout target</span><input type="number" name="weekly_target" min="1" max="7" value="${s.weekly_target}"></label>
        <label class="field"><span>Time in the gym (minutes)</span><input type="number" name="session_minutes" min="20" max="240" step="5" value="${s.session_minutes ?? ''}" placeholder="Use gym window"></label>
        <label class="field"><span>Exercise rotation</span><select name="rotation_mode">
          <option value="all" ${(s.rotation_mode || 'all') === 'all' ? 'selected' : ''}>Rotate every exercise each session</option>
          <option value="accessories" ${s.rotation_mode === 'accessories' ? 'selected' : ''}>Keep main lifts, rotate the rest</option>
          <option value="off" ${s.rotation_mode === 'off' ? 'selected' : ''}>No rotation</option></select></label>
        <label class="field row" style="flex-direction:row;align-items:center;margin-top:24px"><input type="checkbox" name="reduced_motion" ${s.reduced_motion ? 'checked' : ''}><span>Reduce animations</span></label>
      </div>
      <p class="small muted" style="margin-top:10px">Workouts are sized to this time, including warm-up and cool-down. Rotating main lifts adds variety; keeping them fixed makes strength progress easier to track.</p>
      <button class="btn btn-primary" type="submit" style="margin-top:12px">${icon('save')} Save preferences</button>
    </form>

    <form class="card" id="sched">
      <h3>${icon('calendar-days')} Weekly schedule</h3>
      <p class="small muted">Changes apply from today. Past days and completed workouts keep the schedule they had.</p>
      <div class="form-grid">${ORDER.map((wd) => `<label class="field"><span>${WEEKDAYS[wd]}</span><select name="d${wd}">${tpOptions(current[wd])}</select></label>`).join('')}</div>
      <div id="sched-warn" style="margin-top:10px"></div>
      <button class="btn btn-primary" type="submit" style="margin-top:12px">${icon('save')} Save schedule</button>
    </form>

    <section class="card">
      <div class="card-head"><h3>${icon('clipboard-list')} Workout templates</h3><button class="btn btn-sm btn-cyan" data-tpl="new">${icon('plus')} New template</button></div>
      <div class="list">${app.templates.map((t) => `<div class="list-item"><div class="grow"><strong>${esc(t.name)}</strong><div class="small muted">${esc(t.focus)} · ${t.template_exercises.length} exercises</div></div>
        <button class="btn btn-sm btn-ghost" data-tpl="${esc(t.id)}">${icon('pencil')} Edit</button></div>`).join('')}</div>
      <p class="small muted">Editing a template changes future workouts only.</p>
    </section>

    <form class="card" id="pw">
      <h3>${icon('key-round')} Change password</h3>
      <p class="small muted">Signed in as ${esc(app.user.email)}</p>
      <div class="form-grid"><label class="field"><span>New password</span><input type="password" name="pw" minlength="8" autocomplete="new-password"></label>
      <label class="field"><span>Repeat new password</span><input type="password" name="pw2" minlength="8" autocomplete="new-password"></label></div>
      <button class="btn" type="submit" style="margin-top:12px">Update password</button>
    </form>
  </div>`;

  const schedForm = root.querySelector('#sched');
  const checkSched = () => {
    const pick = Object.fromEntries(ORDER.map((wd) => [wd, schedForm.querySelector(`[name="d${wd}"]`).value]));
    const warn = [];
    for (let wd = 0; wd < 7; wd++) {
      const a = app.templatesById[pick[wd]], b = app.templatesById[pick[(wd + 1) % 7]];
      if (!a || !b) continue;
      const overlap = (a.muscle_tags || []).filter((t) => (b.muscle_tags || []).includes(t));
      if (overlap.length) warn.push(`${WEEKDAYS[wd]} (${a.name}) and ${WEEKDAYS[(wd + 1) % 7]} (${b.name}) both train ${overlap.join(', ')}.`);
    }
    const count = Object.values(pick).filter(Boolean).length;
    if (!count) warn.push('Every day is a rest day.');
    root.querySelector('#sched-warn').innerHTML = warn.map((w) => `<div class="notice warn" style="margin-top:6px">${esc(w)}</div>`).join('');
    return pick;
  };
  checkSched();
  schedForm.addEventListener('change', checkSched);
  schedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.saveSchedule(checkSched(), today); await app.reload('schedule'); toast('Schedule saved from today onward', 'success'); } catch (err) { toast(err.message, 'error'); }
  });

  root.querySelector('#profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; clearErrors(f);
    const d = formData(f);
    if (!d.start_date) return fieldError(f, 'start_date', 'Choose a start date.');
    if (d.gym_start >= d.gym_end) return fieldError(f, 'gym_end', 'End time must be after the start time.');
    if (d.protein_min_g > d.protein_max_g) return fieldError(f, 'protein_max_g', 'Max must be at least the minimum.');
    if (d.kcal_min > d.kcal_max) return fieldError(f, 'kcal_max', 'Max must be at least the minimum.');
    for (const k of ['protein_min_g', 'protein_max_g', 'kcal_min', 'kcal_max', 'carbs_g', 'fat_g', 'water_ml', 'program_weeks']) if (d[k] == null) return fieldError(f, k, 'Required.');
    try {
      await api.saveProfile(d);
      await app.reload('profile');
      toast('Profile saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  root.querySelector('#prefs').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.currentTarget);
    if (!(d.default_rest_seconds >= 15 && d.default_rest_seconds <= 600)) return fieldError(e.currentTarget, 'default_rest_seconds', '15–600 seconds.');
    if (!(d.weekly_target >= 1 && d.weekly_target <= 7)) return fieldError(e.currentTarget, 'weekly_target', '1–7 workouts.');
    if (d.session_minutes != null && !(d.session_minutes >= 20 && d.session_minutes <= 240)) return fieldError(e.currentTarget, 'session_minutes', 'Between 20 and 240 minutes, or leave blank.');
    try { await api.saveSettings(d); await app.reload('profile'); toast('Preferences saved', 'success'); } catch (err) { toast(err.message, 'error'); }
  });

  root.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; clearErrors(f);
    if (f.pw.value.length < 8) return fieldError(f, 'pw', 'Use at least 8 characters.');
    if (f.pw.value !== f.pw2.value) return fieldError(f, 'pw2', 'Passwords do not match.');
    const { error } = await sb.auth.updateUser({ password: f.pw.value });
    if (error) return fieldError(f, 'pw', error.message);
    f.reset(); toast('Password updated', 'success');
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    const saved = await editTemplate(b.dataset.tpl === 'new' ? null : app.templatesById[b.dataset.tpl]);
    if (saved) { await app.reload('templates'); rerender(); }
  });
}

function nextDateFor(today, wd) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((wd - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function editTemplate(t) {
  const rows = (t?.template_exercises || []).map((x) => ({ exercise_id: x.exercise_id, target_sets: x.target_sets, rep_min: x.rep_min, rep_max: x.rep_max, rest_seconds: x.rest_seconds }));
  const exOpts = (sel) => app.exercises.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const rowHTML = (r, i) => `<div class="card card-tight" data-row="${i}" style="margin-top:8px">
    <div class="form-grid" style="grid-template-columns:2fr repeat(4,1fr)">
      <label class="field"><span>Exercise</span><select name="exercise_id">${exOpts(r.exercise_id)}</select></label>
      <label class="field"><span>Sets</span><input type="number" name="target_sets" min="1" max="10" value="${r.target_sets}"></label>
      <label class="field"><span>Reps from</span><input type="number" name="rep_min" min="1" max="100" value="${r.rep_min}"></label>
      <label class="field"><span>to</span><input type="number" name="rep_max" min="1" max="100" value="${r.rep_max}"></label>
      <label class="field"><span>Rest (s)</span><input type="number" name="rest_seconds" min="15" max="600" step="15" value="${r.rest_seconds ?? ''}" placeholder="default"></label>
    </div>
    <div class="row" style="margin-top:6px"><button type="button" class="btn btn-sm btn-ghost" data-m="up">↑</button><button type="button" class="btn btn-sm btn-ghost" data-m="down">↓</button><button type="button" class="btn btn-sm btn-ghost" data-m="rm">Remove</button></div>
  </div>`;

  return dialog({
    title: t ? `Edit ${t.name}` : 'New template', wide: true,
    body: `<form id="tf" class="stack" novalidate>
      <div class="form-grid"><label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(t?.name || '')}"></label>
      <label class="field"><span>Focus</span><input name="focus" maxlength="200" value="${esc(t?.focus || '')}"></label></div>
      <div><span class="small muted">Muscles trained (used to warn about back-to-back days)</span>
      <div class="chips" style="flex-wrap:wrap;margin-top:6px">${TAGS.map((g) => `<button type="button" class="chip" data-tag="${g}" aria-pressed="${(t?.muscle_tags || []).includes(g)}">${g}</button>`).join('')}</div></div>
      <div id="rows"></div>
      <button type="button" class="btn btn-cyan btn-sm" id="addrow">+ Add exercise</button>
    </form>`,
    actions: `${t ? '<button class="btn btn-danger" data-archive>Archive</button>' : ''}<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save template</button>`,
    bind: (d, close) => {
      const box = d.querySelector('#rows');
      const read = () => [...box.querySelectorAll('[data-row]')].forEach((el, i) => {
        const g = (n) => el.querySelector(`[name=${n}]`).value;
        rows[i] = { exercise_id: g('exercise_id'), target_sets: Number(g('target_sets')), rep_min: Number(g('rep_min')), rep_max: Number(g('rep_max')), rest_seconds: g('rest_seconds') ? Number(g('rest_seconds')) : null };
      });
      const draw = () => { box.innerHTML = rows.map(rowHTML).join('') || '<p class="muted">No exercises yet.</p>'; };
      draw();
      d.querySelector('#addrow').addEventListener('click', () => { read(); const x = app.exercises[0]; rows.push({ exercise_id: x.id, target_sets: x.default_sets, rep_min: x.rep_min, rep_max: x.rep_max, rest_seconds: null }); draw(); });
      d.addEventListener('click', async (e) => {
        const tag = e.target.closest('[data-tag]');
        if (tag) tag.setAttribute('aria-pressed', tag.getAttribute('aria-pressed') !== 'true');
        const m = e.target.closest('[data-m]');
        if (m) {
          read();
          const i = Number(m.closest('[data-row]').dataset.row);
          if (m.dataset.m === 'rm') rows.splice(i, 1);
          if (m.dataset.m === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
          if (m.dataset.m === 'down' && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
          draw();
        }
        if (e.target.closest('[data-archive]')) {
          const inUse = Object.values(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((wd) => [wd, templateIdForDate(app.schedule, nextDateFor(app.today(), wd))]))).includes(t.id);
          if (inUse) { toast('Remove this template from your weekly schedule first.', 'error'); return; }
          if (!(await confirmDialog(`Archive ${t.name}? Past workouts stay in your history.`, { confirmLabel: 'Archive', danger: true }))) return;
          await api.archiveTemplate(t.id); close(true);
        }
        if (e.target.closest('[data-ok]')) {
          read();
          const f = d.querySelector('#tf'); clearErrors(f);
          const fld = (n) => f.elements.namedItem(n); // not f.name / f.focus — those are built-in form properties
          const name = fld('name').value.trim();
          if (name.length < 2) return fieldError(f, 'name', 'Name needs at least 2 characters.');
          const bad = rows.findIndex((r) => !(r.target_sets >= 1 && r.target_sets <= 10) || !(r.rep_min >= 1) || r.rep_min > r.rep_max || (r.rest_seconds != null && (r.rest_seconds < 15 || r.rest_seconds > 600)));
          if (bad >= 0) { toast(`Check exercise ${bad + 1}: sets 1–10, reps "from" no higher than "to", rest 15–600 s.`, 'error', 5000); return; }
          try {
            const res = await api.saveTemplate({ id: t?.id, name, focus: fld('focus').value.trim(), muscle_tags: [...d.querySelectorAll('[data-tag][aria-pressed="true"]')].map((x) => x.dataset.tag) });
            await api.saveTemplateExercises(res.data.id, rows);
            toast('Template saved', 'success'); close(true);
          } catch (err) { toast(err.message, 'error', 5000); }
        }
      });
    },
  });
}
