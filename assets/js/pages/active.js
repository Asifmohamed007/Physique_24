// Active workout tracker — built for one-handed use between sets.
import { app } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, dialog, confirmDialog, toast, emptyState, refreshIcons } from '../core/ui.js';
import { exerciseMedia, videoLink } from '../core/media.js';
import { onStatus, isNetworkError } from '../core/sync.js';
import { toDisplay, toKg } from '../logic/units.js';
import { durationLabel, formatShort } from '../logic/dates.js';
import { sessionStats, detectPRs, bestOf, mergeBests, doneSets } from '../logic/records.js';
import { suggestProgression } from '../logic/progression.js';
import { computeStreaks, weeklyCounts, earnedAchievements } from '../logic/streaks.js';
import { prLabel } from './dashboard.js';
import { readExtras, writeExtras } from './plan.js';

const draftKey = () => `fitapp:draft:${api.uid()}`;
let model = null;          // { session, exercises: [...] }
let prev = {};             // exercise_name -> history (newest first)
let suggestions = {};      // exercise_name -> pending suggestion
let timers = [];
let wakeLock = null;

export async function render(root) {
  model = null;
  let session;
  try {
    session = await api.loadActiveSession();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const d = readDraft();
    if (!d) throw new Error('You are offline and there is no saved draft on this device.');
    toast('Offline: showing the copy saved on this device. Changes will sync when you reconnect.', 'info', 5000);
    model = d;
  }
  if (!model) {
    if (!session) {
      root.innerHTML = emptyState('dumbbell', 'No workout in progress', 'Start today\'s workout to track sets, weights and rest.', '<a class="btn btn-primary" href="#/workout">Go to today\'s workout</a>');
      return;
    }
    model = buildModel(session);
    try {
      const names = model.exercises.map((e) => e.exercise_name);
      const [p, s] = await Promise.all([api.previousPerformance(names, session.id), api.loadPendingSuggestions()]);
      prev = p;
      suggestions = Object.fromEntries(s.map((x) => [x.exercise_name, x]));
    } catch { prev = {}; suggestions = {}; }
    model.prev = prev; model.suggestions = suggestions;
    saveDraft();
  } else { prev = model.prev || {}; suggestions = model.suggestions || {}; }

  draw(root);
  bind(root);
  startClock(root);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  const off = onStatus(() => saveDraft());
  return () => { timers.forEach(clearInterval); timers = []; off(); wakeLock?.release?.().catch(() => {}); wakeLock = null; hideRest(); };
}

// ---------------- model ----------------
function buildModel(session) {
  const exercises = session.session_exercises.map((se) => {
    const n = Math.max(se.target_sets, ...se.exercise_sets.map((s) => s.set_number), 0);
    const sets = Array.from({ length: n }, (_, i) => {
      const s = se.exercise_sets.find((x) => x.set_number === i + 1);
      return s ? { ...s, saved: true } : newSet(se.id, i + 1);
    });
    return { ...se, sets };
  });
  return { session, exercises };
}
const newSet = (seId, n) => ({ id: crypto.randomUUID(), session_exercise_id: seId, set_number: n, weight_kg: null, reps: null, completed: false, saved: false });
function saveDraft() { try { if (model) localStorage.setItem(draftKey(), JSON.stringify(model)); } catch { /* full */ } }
function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey())); } catch { return null; } }
const clearDraft = () => localStorage.removeItem(draftKey());
const exMeta = (e) => app.exById[e.exercise_id] || { name: e.exercise_name, muscle_group: e.muscle_group, equipment: e.equipment };

// ---------------- render ----------------
function draw(root) {
  const unit = app.unit();
  const done = model.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
  const total = model.exercises.reduce((a, e) => a + e.sets.length, 0);
  root.innerHTML = `
    <div class="wk-bar">
      <div><div class="small muted">${esc(model.session.name)}</div><span class="num" id="clock">0:00</span></div>
      <div class="grow" style="flex:1"><div class="small muted" style="text-align:right"><span id="setcount">${done}</span> / ${total} sets</div>
        <div class="bar" style="margin-top:6px"><span id="setbar" style="width:${total ? (done / total) * 100 : 0}%"></span></div></div>
      <button class="btn btn-primary" data-act="finish">${icon('flag')} Finish</button>
    </div>
    <div id="exlist">${model.exercises.map((e, i) => exCard(e, i, unit)).join('')}</div>
    <div id="extras">${extrasHTML()}</div>
    <div class="row" style="margin-top:16px">
      <button class="btn btn-cyan" data-act="add-ex">${icon('plus')} Add exercise</button>
      <button class="btn btn-ghost" data-act="rest-only">${icon('timer')} Rest timer</button>
      <span style="flex:1"></span>
      <button class="btn btn-danger" data-act="discard">${icon('trash-2')} Discard workout</button>
    </div>
    <p class="small muted" style="margin-top:14px">Each set saves as you type. Stop if you feel sharp pain, dizziness, chest pain or unusual breathlessness.</p>
    <div class="rest-timer" id="rest" role="timer" aria-live="off">
      <span class="num" id="rest-n">1:30</span><div class="bar cyan"><span id="rest-bar"></span></div>
      <button class="icon-btn" data-rest="toggle" aria-label="Pause or resume">${icon('pause')}</button>
      <button class="icon-btn" data-rest="reset" aria-label="Reset">${icon('rotate-ccw')}</button>
      <button class="icon-btn" data-rest="close" aria-label="Close timer">${icon('x')}</button>
    </div>`;
}

function extrasHTML() {
  const list = readExtras(model.session.id);
  if (!list.length) return '';
  return `<section class="card card-tight" style="margin-top:14px;border-style:dashed">
    <strong>${icon('clock')} If you have time</strong>
    <p class="small muted" style="margin:4px 0 10px">Optional — your planned workout is complete without these.</p>
    <div class="chips" style="flex-wrap:wrap">${list.map((x, k) => `<button class="chip" data-act="extra-add" data-k="${k}">${icon('plus')} ${esc(x.exercise_name)} <span class="muted">${x.target_sets}×${x.rep_min}–${x.rep_max}</span></button>`).join('')}</div>
  </section>`;
}

function exCard(e, i, unit) {
  const meta = exMeta(e);
  const hist = prev[e.exercise_name]?.[0];
  const sug = suggestions[e.exercise_name];
  const allDone = e.sets.length && e.sets.every((s) => s.completed);
  const vid = videoLink(meta);
  return `
  <article class="ex-card ${allDone ? 'done' : ''}" data-ex="${i}">
    <div class="ex-head">
      <div class="ex-thumb">${exerciseMedia(meta)}</div>
      <div><h3>${esc(e.exercise_name)}</h3>
        <div class="ex-meta">${esc((meta.primary_muscles || [e.muscle_group]).join(', '))} · ${esc(e.equipment)}</div>
        <div class="ex-meta">Target ${e.target_sets} × ${e.rep_min}–${e.rep_max}${meta.per_side ? ' per side' : ''} · rest ${Math.round(e.rest_seconds / 60 * 10) / 10} min</div></div>
      <div class="row" style="flex-direction:column;gap:6px">
        <button class="icon-btn" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>
        <button class="icon-btn" data-act="down" aria-label="Move down" ${i === model.exercises.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>
      </div>
    </div>
    ${hist ? `<div class="ex-prev">${icon('history')} Last time (${esc(formatShort(hist.session_date))}): ${hist.sets.filter((s) => s.completed).map((s) => `${fmt(toDisplay(s.weight_kg, unit), 1)}${unit} × ${s.reps}`).join(', ') || 'no completed sets'}</div>`
      : '<div class="ex-prev">First time logging this exercise — today sets your baseline.</div>'}
    ${sug ? `<div class="ex-suggest" data-sug="${esc(sug.id)}"><strong>${sug.kind === 'increase' ? 'Ready to progress' : sug.kind === 'recovery_check' ? 'Check recovery' : 'Suggestion'}:</strong> ${esc(sug.message)}
      <div class="row" style="margin-top:8px">
        ${sug.suggested_weight_kg != null ? `<button class="btn btn-sm btn-primary" data-act="sug-accept">Use ${fmt(toDisplay(sug.suggested_weight_kg, unit), 1)} ${unit}</button>
        <button class="btn btn-sm btn-ghost" data-act="sug-edit">Edit</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="sug-reject">Dismiss</button>
      </div></div>` : ''}
    <details class="ex-info"><summary>How to do it</summary>
      <p>${esc(meta.instructions || 'No instructions saved for this exercise.')}</p>
      ${meta.safety_tips ? `<p><strong>Safety:</strong> ${esc(meta.safety_tips)}</p>` : ''}
      <a href="${esc(vid.href)}" target="_blank" rel="noopener">${icon('video')} ${esc(vid.label)}</a>
      ${meta.image_attribution ? `<p class="small">Image: ${esc(meta.image_attribution)}</p>` : ''}
    </details>
    <div class="sets">
      <div class="set-head"><span>SET</span><span>${unit.toUpperCase()}</span><span>REPS</span><span>DONE</span></div>
      ${e.sets.map((s, j) => setRow(e, s, j, unit, hist)).join('')}
    </div>
    <div class="ex-tools">
      <button class="btn btn-sm btn-ghost" data-act="add-set">${icon('plus')} Set</button>
      <button class="btn btn-sm btn-ghost" data-act="rm-set" ${e.sets.length <= 1 ? 'disabled' : ''}>${icon('minus')} Set</button>
      <button class="btn btn-sm btn-ghost" data-act="rest-cfg">${icon('timer')} ${e.rest_seconds}s</button>
      <button class="btn btn-sm btn-ghost" data-act="note">${icon('sticky-note')} ${e.notes ? 'Edit note' : 'Note'}</button>
      <button class="btn btn-sm btn-ghost" data-act="replace">${icon('replace')} Replace</button>
      <button class="btn btn-sm btn-ghost" data-act="rm-ex">${icon('trash-2')}</button>
    </div>
    ${e.notes ? `<p class="small muted" style="padding:0 14px 12px;margin:0">${icon('sticky-note')} ${esc(e.notes)}</p>` : ''}
  </article>`;
}

function setRow(e, s, j, unit, hist) {
  const p = hist?.sets?.find((x) => x.set_number === s.set_number);
  return `<div class="set-row ${s.completed ? 'completed' : ''}" data-set="${j}">
    <span class="set-no">${s.set_number}</span>
    <input inputmode="decimal" type="number" step="0.25" min="0" max="1000" name="w" aria-label="Set ${s.set_number} weight in ${unit}"
      value="${s.weight_kg != null ? toDisplay(s.weight_kg, unit) : ''}" placeholder="${p?.weight_kg != null ? toDisplay(p.weight_kg, unit) : '—'}">
    <input inputmode="numeric" type="number" step="1" min="0" max="200" name="r" aria-label="Set ${s.set_number} reps"
      value="${s.reps ?? ''}" placeholder="${p?.reps ?? `${e.rep_min}-${e.rep_max}`}">
    <button class="set-done" data-act="toggle" aria-pressed="${s.completed}" aria-label="Mark set ${s.set_number} complete">${icon('check')}</button>
  </div>`;
}

function refreshCard(root, i) {
  const card = root.querySelector(`[data-ex="${i}"]`);
  const tmp = document.createElement('div');
  tmp.innerHTML = exCard(model.exercises[i], i, app.unit());
  const fresh = tmp.firstElementChild;
  fresh.querySelector('details').open = card.querySelector('details')?.open || false;
  card.replaceWith(fresh);
  refreshIcons(fresh);
  updateCounts(root);
}
function redrawAll(root) {
  root.querySelector('#exlist').innerHTML = model.exercises.map((e, i) => exCard(e, i, app.unit())).join('');
  refreshIcons(root.querySelector('#exlist'));
  updateCounts(root);
}
function updateCounts(root) {
  const done = model.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
  const total = model.exercises.reduce((a, e) => a + e.sets.length, 0);
  root.querySelector('#setcount').textContent = done;
  root.querySelector('#setcount').parentElement.lastChild.textContent = ` / ${total} sets`;
  root.querySelector('#setbar').style.width = `${total ? (done / total) * 100 : 0}%`;
}

// ---------------- persistence helpers ----------------
function persistSet(s) { s.saved = true; saveDraft(); return api.queueSet(s); }
function persistExercise(e) {
  saveDraft();
  return api.queueSessionExercise({ ...e, session_id: model.session.id });
}
function reindex() { model.exercises.forEach((e, i) => { e.position = i; }); }

// ---------------- events ----------------
function bind(root) {
  const debouncers = new Map();
  root.addEventListener('input', (ev) => {
    const row = ev.target.closest('[data-set]');
    if (!row) return;
    const i = Number(row.closest('[data-ex]').dataset.ex), j = Number(row.dataset.set);
    const s = model.exercises[i].sets[j];
    const unit = app.unit();
    if (ev.target.name === 'w') {
      const kg = toKg(ev.target.value, unit);
      if (Number.isNaN(kg)) { ev.target.setAttribute('aria-invalid', 'true'); return; }
      ev.target.removeAttribute('aria-invalid');
      s.weight_kg = kg;
    } else {
      const r = ev.target.value === '' ? null : Math.round(Number(ev.target.value));
      if (r != null && (!(r >= 0) || r > 200)) { ev.target.setAttribute('aria-invalid', 'true'); return; }
      ev.target.removeAttribute('aria-invalid');
      s.reps = r;
    }
    saveDraft();
    clearTimeout(debouncers.get(s.id));
    debouncers.set(s.id, setTimeout(() => persistSet(s), 700));
  });

  root.addEventListener('click', async (ev) => {
    const restBtn = ev.target.closest('[data-rest]');
    if (restBtn) return restControl(restBtn.dataset.rest);
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-ex]');
    const i = card ? Number(card.dataset.ex) : -1;
    const e = model.exercises[i];
    const act = btn.dataset.act;
    try {
      switch (act) {
        case 'toggle': {
          const j = Number(btn.closest('[data-set]').dataset.set);
          const s = e.sets[j];
          if (!s.completed && !(s.reps > 0)) { toast('Enter the reps for this set first.', 'error'); btn.closest('[data-set]').querySelector('[name=r]').focus(); return; }
          s.completed = !s.completed;
          s.completed_at = s.completed ? new Date().toISOString() : null;
          clearTimeout(debouncers.get(s.id));
          persistSet(s);
          refreshCard(root, i);
          if (s.completed) {
            const next = e.sets.find((x) => !x.completed);
            startRest(e.rest_seconds, next ? `Next: ${e.exercise_name} set ${next.set_number}` : `Next: ${model.exercises[i + 1]?.exercise_name || 'finish up'}`);
            navigator.vibrate?.(30);
          }
          break;
        }
        case 'add-set': {
          const last = e.sets[e.sets.length - 1];
          if (e.sets.length >= 20) return;
          const s = newSet(e.id, e.sets.length + 1);
          s.weight_kg = null;
          e.sets.push(s);
          saveDraft();
          refreshCard(root, i);
          root.querySelector(`[data-ex="${i}"] [data-set="${e.sets.length - 1}"] [name=w]`)?.setAttribute('placeholder', last?.weight_kg != null ? toDisplay(last.weight_kg, app.unit()) : '—');
          break;
        }
        case 'rm-set': {
          const s = e.sets[e.sets.length - 1];
          if (s.completed && !(await confirmDialog(`Remove completed set ${s.set_number}?`, { confirmLabel: 'Remove set', danger: true }))) return;
          e.sets.pop();
          if (s.saved) api.queueDeleteSet(s.id);
          saveDraft();
          refreshCard(root, i);
          break;
        }
        case 'up': case 'down': {
          const k = act === 'up' ? i - 1 : i + 1;
          [model.exercises[i], model.exercises[k]] = [model.exercises[k], model.exercises[i]];
          reindex();
          persistExercise(model.exercises[i]); persistExercise(model.exercises[k]);
          redrawAll(root);
          break;
        }
        case 'rest-cfg': {
          const v = await pickRest(e.rest_seconds);
          if (!v) return;
          e.rest_seconds = v; persistExercise(e); refreshCard(root, i);
          break;
        }
        case 'note': {
          const v = await dialog({
            title: `${e.exercise_name} note`, body: `<label class="field"><span>Note</span><textarea name="n" maxlength="1000" placeholder="Seat height, grip, how it felt…">${esc(e.notes || '')}</textarea></label>`,
            actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save note</button>',
            bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => close(d.querySelector('textarea').value.trim())),
          });
          if (v === null) return;
          e.notes = v; persistExercise(e); refreshCard(root, i);
          break;
        }
        case 'replace': {
          const meta = exMeta(e);
          const pick = await pickExercise(`Replace ${e.exercise_name}`, (meta.alternatives || []).map((slug) => app.exBySlug[slug]).filter(Boolean), meta.muscle_group);
          if (!pick) return;
          if (e.sets.some((s) => s.completed) && !(await confirmDialog('Sets already logged will move to the new exercise. Continue?', { confirmLabel: 'Replace' }))) return;
          Object.assign(e, { exercise_id: pick.id, exercise_name: pick.name, muscle_group: pick.muscle_group, equipment: pick.equipment, rep_min: pick.rep_min, rep_max: pick.rep_max });
          persistExercise(e);
          try { Object.assign(prev, await api.previousPerformance([pick.name], model.session.id)); } catch { /* offline */ }
          refreshCard(root, i);
          break;
        }
        case 'rm-ex': {
          if (!(await confirmDialog(`Remove ${e.exercise_name} from this workout?`, { confirmLabel: 'Remove', danger: true }))) return;
          model.exercises.splice(i, 1);
          api.queueDeleteSessionExercise(e.id);
          reindex(); model.exercises.forEach(persistExercise);
          redrawAll(root);
          break;
        }
        case 'add-ex': {
          const pick = await pickExercise('Add exercise', [], null);
          if (!pick) return;
          const ex = {
            id: crypto.randomUUID(), session_id: model.session.id, exercise_id: pick.id, exercise_name: pick.name,
            muscle_group: pick.muscle_group, equipment: pick.equipment, position: model.exercises.length,
            target_sets: pick.default_sets, rep_min: pick.rep_min, rep_max: pick.rep_max,
            rest_seconds: app.settings.default_rest_seconds, notes: '',
          };
          ex.sets = Array.from({ length: pick.default_sets }, (_, k) => newSet(ex.id, k + 1));
          model.exercises.push(ex);
          await persistExercise(ex);
          try { Object.assign(prev, await api.previousPerformance([pick.name], model.session.id)); } catch { /* offline */ }
          redrawAll(root);
          root.querySelector(`[data-ex="${model.exercises.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'extra-add': {
          const list = readExtras(model.session.id);
          const x = list.splice(Number(btn.dataset.k), 1)[0];
          if (!x) return;
          const ex = { ...x, id: crypto.randomUUID(), session_id: model.session.id, position: model.exercises.length, notes: '' };
          ex.sets = Array.from({ length: ex.target_sets }, (_, k) => newSet(ex.id, k + 1));
          model.exercises.push(ex);
          writeExtras(model.session.id, list);
          await persistExercise(ex);
          try { Object.assign(prev, await api.previousPerformance([ex.exercise_name], model.session.id)); } catch { /* offline */ }
          redrawAll(root);
          root.querySelector('#extras').innerHTML = extrasHTML(); refreshIcons(root.querySelector('#extras'));
          root.querySelector(`[data-ex="${model.exercises.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'sug-accept': case 'sug-edit': case 'sug-reject': await handleSuggestion(root, i, act); break;
        case 'rest-only': startRest(app.settings.default_rest_seconds, 'Rest'); break;
        case 'finish': await finish(root); break;
        case 'discard': {
          if (!(await confirmDialog('This deletes the workout and every set you logged in it. This cannot be undone.', { title: 'Discard workout?', confirmLabel: 'Discard workout', danger: true }))) return;
          await api.discardSession(model.session.id);
          clearDraft();
          toast('Workout discarded');
          location.hash = '#/workout';
          break;
        }
        default:
      }
    } catch (err) { toast(err.message, 'error', 5000); }
  });
}

async function handleSuggestion(root, i, act) {
  const e = model.exercises[i];
  const sug = suggestions[e.exercise_name];
  if (!sug) return;
  const unit = app.unit();
  let weight = sug.suggested_weight_kg;
  if (act === 'sug-reject') {
    await api.resolveSuggestion(sug.id, { status: 'rejected', result_session_id: model.session.id });
  } else {
    if (act === 'sug-edit') {
      const v = await dialog({
        title: 'Choose your working weight', body: `<label class="field"><span>Weight (${unit})</span><input name="w" type="number" inputmode="decimal" step="0.25" min="0" value="${toDisplay(weight, unit)}"></label>`,
        actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Use this weight</button>',
        bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => close(d.querySelector('input').value)),
      });
      if (v === null) return;
      weight = toKg(v, unit);
      if (!(weight >= 0)) { toast('Enter a valid weight.', 'error'); return; }
    }
    await api.resolveSuggestion(sug.id, { status: act === 'sug-edit' ? 'edited' : 'accepted', final_weight_kg: weight, result_session_id: model.session.id });
    // user confirmed: pre-fill empty, unfinished sets
    for (const s of e.sets) if (!s.completed && s.weight_kg == null) { s.weight_kg = weight; persistSet(s); }
  }
  delete suggestions[e.exercise_name];
  model.suggestions = suggestions;
  saveDraft();
  refreshCard(root, i);
}

function pickRest(current) {
  const opts = [45, 60, 75, 90, 120, 150, 180, 240];
  return dialog({
    title: 'Rest between sets', body: `<div class="chips" style="flex-wrap:wrap">${opts.map((o) => `<button class="chip" data-v="${o}" aria-pressed="${o === current}">${o < 60 ? `${o}s` : `${o / 60} min`}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:12px">Big lifts: 2–3 min. Smaller movements: 60–120 s.</p>`,
    bind: (d, close) => d.addEventListener('click', (ev) => { const c = ev.target.closest('[data-v]'); if (c) close(Number(c.dataset.v)); }),
  });
}

function pickExercise(title, suggested, group) {
  const list = app.exercises;
  return dialog({
    title, wide: true,
    body: `<input type="search" name="q" placeholder="Search exercises" aria-label="Search exercises">
      ${suggested.length ? `<p class="small muted" style="margin:12px 0 6px">Suggested alternatives</p><div class="chips" style="flex-wrap:wrap">${suggested.map((x) => `<button class="chip" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="list" id="pick-list" style="margin-top:10px"></div>`,
    bind: (d, close) => {
      const out = d.querySelector('#pick-list');
      const draw = (q = '') => {
        const term = q.toLowerCase();
        const rows = list.filter((x) => !term || x.name.toLowerCase().includes(term) || x.muscle_group.includes(term) || x.equipment.includes(term))
          .sort((a, b) => (a.muscle_group === group ? -1 : 0) - (b.muscle_group === group ? -1 : 0));
        out.innerHTML = rows.slice(0, 60).map((x) => `<button class="list-item" data-id="${esc(x.id)}" style="background:none;border:0;border-bottom:1px solid var(--line-soft);color:inherit;text-align:left;cursor:pointer;width:100%">
          <div class="grow"><strong>${esc(x.name)}</strong><div class="small muted">${esc(x.muscle_group)} · ${esc(x.equipment)}</div></div></button>`).join('') || '<p class="muted">No matches.</p>';
      };
      draw();
      d.querySelector('[name=q]').addEventListener('input', (ev) => draw(ev.target.value));
      d.addEventListener('click', (ev) => { const b = ev.target.closest('[data-id]'); if (b) close(app.exById[b.dataset.id]); });
    },
  });
}

// ---------------- clock & rest timer ----------------
function startClock(root) {
  const started = new Date(model.session.started_at).getTime();
  const tick = () => { const el = root.querySelector('#clock'); if (el) el.textContent = durationLabel(Date.now() - started); };
  tick();
  timers.push(setInterval(tick, 1000));
}

const rest = { end: 0, total: 0, left: 0, running: false, int: null };
function startRest(seconds, label) {
  rest.total = seconds; rest.left = seconds; rest.end = Date.now() + seconds * 1000; rest.running = true;
  const el = document.getElementById('rest');
  if (!el) return;
  el.classList.add('show'); el.classList.remove('finished');
  el.title = label || '';
  clearInterval(rest.int);
  rest.int = setInterval(restTick, 250);
  timers.push(rest.int);
  restTick();
}
function restTick() {
  const el = document.getElementById('rest');
  if (!el) return;
  if (rest.running) rest.left = Math.max(0, (rest.end - Date.now()) / 1000);
  document.getElementById('rest-n').textContent = durationLabel(Math.ceil(rest.left) * 1000);
  document.getElementById('rest-bar').style.width = `${rest.total ? (rest.left / rest.total) * 100 : 0}%`;
  if (rest.running && rest.left <= 0) {
    rest.running = false;
    el.classList.add('finished');
    navigator.vibrate?.([200, 100, 200]);
    beep();
  }
}
function restControl(cmd) {
  if (cmd === 'toggle') {
    if (rest.running) { rest.running = false; } else if (rest.left > 0) { rest.running = true; rest.end = Date.now() + rest.left * 1000; }
    const b = document.querySelector('[data-rest="toggle"]');
    b.innerHTML = icon(rest.running ? 'pause' : 'play'); refreshIcons(b);
  }
  if (cmd === 'reset') { rest.left = rest.total; rest.end = Date.now() + rest.total * 1000; rest.running = true; document.getElementById('rest').classList.remove('finished'); }
  if (cmd === 'close') hideRest();
  restTick();
}
function hideRest() { rest.running = false; clearInterval(rest.int); document.getElementById('rest')?.classList.remove('show'); }
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.25);
  } catch { /* audio blocked */ }
}

// ---------------- finish ----------------
async function finish(root) {
  const unticked = model.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.completed && (s.reps > 0 || s.weight_kg != null)).length, 0);
  const completedSets = model.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
  if (!completedSets) { toast('Tick at least one completed set before finishing, or discard the workout.', 'error', 5000); return; }

  const form = await dialog({
    title: 'Finish workout',
    body: `${unticked ? `<div class="notice warn" style="margin-bottom:12px">${unticked} set(s) have numbers but aren't ticked — they won't count. Go back and tick them if you did them.</div>` : ''}
      <label class="field"><span>How hard was it? (1 = easy, 10 = maximal)</span><input type="range" name="d" min="1" max="10" value="7"><output id="dv" class="num" style="font-size:1.6rem">7</output></label>
      <label class="field" style="margin-top:12px"><span>Workout notes</span><textarea name="n" maxlength="2000" placeholder="Energy, sleep, anything that felt off…">${esc(model.session.notes || '')}</textarea></label>`,
    actions: '<button class="btn btn-ghost" data-close>Keep training</button><button class="btn btn-primary" data-ok>Save & finish</button>',
    bind: (d, close) => {
      const r = d.querySelector('[name=d]');
      r.addEventListener('input', () => { d.querySelector('#dv').textContent = r.value; });
      d.querySelector('[data-ok]').addEventListener('click', () => close({ difficulty: Number(r.value), notes: d.querySelector('textarea').value.trim() }));
    },
  });
  if (!form) return;

  const btn = root.querySelector('[data-act="finish"]');
  btn.setAttribute('aria-busy', 'true');
  const s = model.session;
  try {
    await api.finishSession(s.id, { ended_at: new Date().toISOString(), notes: form.notes, difficulty: form.difficulty });
  } catch (err) {
    btn.removeAttribute('aria-busy');
    toast(/duplicate key/i.test(err.message) ? 'This scheduled workout was already completed. Discard this copy or change it to a custom workout.' : err.message, 'error', 6000);
    return;
  }
  clearDraft();
  writeExtras(s.id, []);
  hideRest();

  // records, suggestions, achievements — workout is already safely saved above
  const today = app.today();
  const names = model.exercises.map((e) => e.exercise_name);
  let prs = [];
  try {
    const past = await api.allTimeBests(names, s.id);
    for (const e of model.exercises) {
      const prevBest = mergeBests((past[e.exercise_name] || []).map(bestOf));
      const isBW = e.equipment === 'bodyweight' && !e.sets.some((x) => x.completed && x.weight_kg > 0);
      for (const pr of detectPRs(e.sets, prevBest, isBW)) {
        const top = doneSets(e.sets).sort((a, b) => (b.weight_kg || 0) - (a.weight_kg || 0) || b.reps - a.reps)[0];
        prs.push({ exercise_id: e.exercise_id, exercise_name: e.exercise_name, record_type: pr.record_type, value: pr.value, weight_kg: top?.weight_kg ?? null, reps: top?.reps ?? null, session_id: s.id, achieved_on: today });
      }
    }
    await api.savePRs(prs);
  } catch (err) { console.warn('PR detection failed', err); prs = []; }

  try {
    const list = [];
    for (const e of model.exercises) {
      const history = [{ ...e, sets: e.sets }, ...(prev[e.exercise_name] || [])];
      const sug = suggestProgression({ name: e.exercise_name, load_increment_kg: exMeta(e).load_increment_kg ?? 2.5 }, history);
      if (sug) list.push({ exercise_id: e.exercise_id, exercise_name: e.exercise_name, based_on_session_id: s.id, ...sug });
    }
    await api.saveSuggestions(list);
  } catch (err) { console.warn('Suggestions failed', err); }

  let newBadges = [];
  try {
    const sessions = await api.loadSessions();
    const p = app.profile;
    const st = computeStreaks({ start: p.start_date, today, ctx: app.planCtx(), sessions });
    const wc = weeklyCounts({ start: p.start_date, today, sessions, weeks: p.program_weeks });
    const prCount = (await api.loadPRs(1)).length;
    const { all, earned } = await api.loadAchievements();
    const codes = earnedAchievements({ total: st.total, weekCounts: wc, weeklyTarget: app.settings.weekly_target, prCount }).filter((c) => !earned[c]);
    await api.awardAchievements(codes);
    newBadges = all.filter((a) => codes.includes(a.code));
  } catch (err) { console.warn('Achievements failed', err); }

  await summary(root, s, prs, newBadges);
}

async function summary(root, s, prs, badges) {
  const unit = app.unit();
  const full = await api.loadSessionFull(s.id);
  const exs = full.session_exercises.map((e) => ({ ...e, sets: e.exercise_sets }));
  const st = sessionStats(exs);
  let prevStats = null;
  try {
    const older = (await api.loadSessions({ limit: 30 })).find((x) => x.name === full.name && x.id !== full.id);
    if (older) { const o = await api.loadSessionFull(older.id); prevStats = { date: older.session_date, ...sessionStats(o.session_exercises.map((e) => ({ sets: e.exercise_sets }))) }; }
  } catch { /* optional */ }
  const dur = new Date(full.ended_at) - new Date(full.started_at);
  const delta = (a, b) => (b == null ? '' : `<span class="small ${a >= b ? 'accent-lime' : 'muted'}">${a >= b ? '+' : ''}${fmt(a - b)} vs last</span>`);

  root.innerHTML = `
    <div class="stack">
      <section class="panel-hero pr-burst">
        <div class="stripe"></div>
        <p class="muted" style="margin:0">Workout saved</p>
        <div class="day-big" style="font-size:clamp(2.4rem,8vw,4rem)">${esc(full.name)}</div>
        <p class="muted">${esc(formatShort(full.session_date))} · difficulty ${full.difficulty ?? '—'}/10</p>
      </section>
      <section class="grid g4">
        <div class="card stat"><span class="label">Duration</span><span class="num">${durationLabel(dur)}</span></div>
        <div class="card stat"><span class="label">Exercises</span><span class="num">${st.exercisesDone}</span></div>
        <div class="card stat"><span class="label">Sets · reps</span><span class="num">${st.sets}<small>sets</small> ${st.reps}<small>reps</small></span>${delta(st.sets, prevStats?.sets)}</div>
        <div class="card stat"><span class="label">Volume</span><span class="num">${fmt(toDisplay(st.volume, unit))}<small>${unit}</small></span>${delta(st.volume, prevStats?.volume)}</div>
      </section>
      ${prevStats ? `<p class="small muted">Compared with your last ${esc(full.name)} on ${esc(formatShort(prevStats.date))}.</p>` : ''}
      ${prs.length ? `<section class="card"><h3>${icon('medal')} New personal records</h3><div class="list">${prs.map((r) => `<div class="list-item"><strong class="grow">${esc(r.exercise_name)}</strong><span class="small">${esc(prLabel(r, unit))}</span></div>`).join('')}</div></section>` : ''}
      ${badges.length ? `<section class="card"><h3>${icon('award')} Achievement unlocked</h3>${badges.map((b) => `<p><strong class="accent-lime">${esc(b.name)}</strong> — ${esc(b.description)}</p>`).join('')}</section>` : ''}
      ${full.notes ? `<section class="card"><h3>Notes</h3><p class="muted">${esc(full.notes)}</p></section>` : ''}
      <div class="row"><a class="btn btn-primary" href="#/dashboard">Back to dashboard</a><a class="btn btn-ghost" href="#/history/${esc(full.id)}">View all sets</a><a class="btn btn-ghost" href="#/nutrition">Log post-workout meal</a></div>
    </div>`;
  refreshIcons(root);
}
