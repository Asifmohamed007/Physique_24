import { app } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, fmt, pct, dialog, toast, emptyState, refreshIcons, formData, clearErrors, fieldError } from '../core/ui.js';
import { totals, scaleFood, sumWater, proteinGap, proteinSuggestions, mealSchedule, MEALS } from '../logic/nutrition.js';
import { addDays, formatLong, minutesInTz, timeToMinutes } from '../logic/dates.js';

const QUICK = [
  ['Egg, whole (large)', 4, '4 eggs'], ['Chicken breast, cooked', 1.5, '150 g chicken'], ['Fish (white), cooked', 1.5, '150 g fish'],
  ['Milk, full-fat', 1, 'Milk 250 ml'], ['Greek yogurt / strained curd', 1, 'Greek yogurt 200 g'], ['Paneer', 1, 'Paneer 100 g'],
  ['Tofu, firm', 1, 'Tofu 100 g'], ['Lentils / dal, cooked', 1, 'Dal 1 cup'], ['Rice, white, cooked', 1, 'Rice 1 cup'],
  ['Oats, dry', 1, 'Oats 40 g'], ['Bread, whole wheat', 2, 'Bread 2 slices'], ['Banana', 1, 'Banana'],
];

let state;
export async function render(root) {
  const foods = await api.loadFoods();
  state = { date: app.today(), foods, entries: [], water: [], meal: guessMeal() };
  await load();
  draw(root);
  bind(root);
}

async function load() {
  [state.entries, state.water] = await Promise.all([api.loadNutrition(state.date), api.loadWater(state.date)]);
}

function guessMeal() {
  const p = app.profile;
  const now = minutesInTz(new Date(), app.tz());
  const gs = timeToMinutes(p.gym_start), ge = timeToMinutes(p.gym_end);
  if (now < 600) return 'morning';
  if (now < 720) return 'mid_morning';
  if (now < gs - 60) return 'lunch';
  if (now < gs) return 'pre_workout';
  if (now < ge + 150) return 'post_workout';
  return 'evening';
}

function draw(root) {
  const p = app.profile;
  const t = totals(state.entries);
  const water = sumWater(state.water);
  const gap = proteinGap(t.protein_g, p.protein_min_g);
  const isToday = state.date === app.today();
  const byMeal = {};
  for (const e of state.entries) (byMeal[e.meal] ||= []).push(e);
  const sugg = proteinSuggestions(state.foods, gap.remaining);

  root.innerHTML = `
  <div class="stack">
    <div class="row between card card-tight">
      <button class="icon-btn" data-act="prev" aria-label="Previous day">${icon('chevron-left')}</button>
      <div style="text-align:center"><strong>${esc(formatLong(state.date))}</strong>${isToday ? ' <span class="badge badge-lime">Today</span>' : ''}</div>
      <button class="icon-btn" data-act="next" aria-label="Next day" ${isToday ? 'disabled' : ''}>${icon('chevron-right')}</button>
    </div>

    <section class="grid g4">
      <div class="card" style="display:grid;place-items:center"><div class="ring" style="--p:${pct(t.protein_g, p.protein_min_g)};width:120px"><div><span class="num">${fmt(t.protein_g)}</span><small>of ${p.protein_min_g}–${p.protein_max_g} g<br>protein</small></div></div></div>
      <div class="card" style="display:grid;place-items:center"><div class="ring" style="--p:${pct(t.kcal, p.kcal_min)};--c:var(--cyan);width:120px"><div><span class="num">${fmt(t.kcal)}</span><small>of ${fmt(p.kcal_min)}–${fmt(p.kcal_max)}<br>kcal</small></div></div></div>
      <div class="card stack">
        <div><div class="row between small"><span>Carbs</span><span>${fmt(t.carbs_g)} / ${p.carbs_g} g</span></div><div class="bar"><span style="width:${pct(t.carbs_g, p.carbs_g)}%"></span></div></div>
        <div><div class="row between small"><span>Fat</span><span>${fmt(t.fat_g)} / ${p.fat_g} g</span></div><div class="bar"><span style="width:${pct(t.fat_g, p.fat_g)}%"></span></div></div>
        <p class="small muted" style="margin:0">All values are estimates, not exact measurements.</p>
      </div>
      <div class="card">
        <div class="row between"><strong>${icon('glass-water')} Water</strong><span class="num accent-cyan" style="font-size:1.4rem">${fmt(water / 1000, 2)} L</span></div>
        <div class="bar cyan" style="margin:10px 0"><span style="width:${pct(water, p.water_ml)}%"></span></div>
        <div class="row"><button class="btn btn-sm btn-cyan" data-water="250">+250 ml</button><button class="btn btn-sm btn-cyan" data-water="500">+500 ml</button>
        ${state.water.length ? `<button class="btn btn-sm btn-ghost" data-act="water-undo">Undo</button>` : ''}</div>
      </div>
    </section>

    ${!gap.met ? `<section class="card" style="border-color:rgba(198,244,50,.35)">
      <div class="card-head"><h3>${icon('beef')} Protein: ${fmt(gap.remaining)} g to go</h3><span class="badge">${fmt(gap.consumed)} g eaten</span></div>
      <p class="muted small">One or two of these closes the gap. No need to double up tomorrow if today falls short. Whey is optional.</p>
      <div class="list">${sugg.map((f) => `<div class="list-item"><div class="grow"><strong>${esc(f.name)}</strong><div class="small muted">${esc(f.serving_desc)} ≈ ${fmt(f.protein_g, 1)} g protein · ${fmt(f.kcal)} kcal (estimate)</div></div>
        <button class="btn btn-sm" data-add-food="${esc(f.id)}" data-servings="1">${icon('plus')} Add</button></div>`).join('')}</div>
    </section>` : `<div class="notice lime">Protein target reached for this day — nice work.</div>`}

    <section class="card">
      <div class="card-head"><h3>${icon('zap')} Quick add</h3>
        <label class="row small">Meal <select id="meal" style="min-height:38px;width:auto">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}" ${k === state.meal ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="chips" style="flex-wrap:wrap">${QUICK.map(([name, s, label]) => {
        const f = state.foods.find((x) => x.name === name);
        return f ? `<button class="chip" data-add-food="${esc(f.id)}" data-servings="${s}">${esc(label)} <span class="muted">${fmt(f.protein_g * s)} g</span></button>` : '';
      }).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" data-act="search">${icon('search')} Search foods</button><button class="btn btn-ghost" data-act="custom">${icon('plus')} Custom food</button></div>
    </section>

    <section class="card">
      <h3>${icon('list')} Logged</h3>
      ${state.entries.length ? Object.entries(MEALS).filter(([k]) => byMeal[k]).map(([k, label]) => `
        <h4 style="margin:14px 0 4px;color:var(--muted)">${label} <span class="small">${fmt(totals(byMeal[k]).protein_g)} g protein · ${fmt(totals(byMeal[k]).kcal)} kcal</span></h4>
        <div class="list">${byMeal[k].map((e) => `<div class="list-item"><div class="grow"><strong>${esc(e.food_name)}</strong> <span class="muted small">× ${fmt(e.servings, 2)}</span>
          <div class="small muted">${e.eaten_at ? `${esc(e.eaten_at.slice(0, 5))} · ` : ''}${fmt(e.protein_g, 1)} g P · ${fmt(e.carbs_g)} g C · ${fmt(e.fat_g)} g F · ${fmt(e.kcal)} kcal${e.is_estimate ? ' (est.)' : ''}${e.notes ? ` · ${esc(e.notes)}` : ''}</div></div>
          <button class="icon-btn" data-del="${esc(e.id)}" aria-label="Delete ${esc(e.food_name)}">${icon('trash-2')}</button></div>`).join('')}</div>`).join('')
      : emptyState('utensils', 'Nothing logged for this day', 'Start with your morning protein — tap "4 eggs" or "150 g chicken" above.')}
    </section>

    <section class="card">
      <h3>${icon('clock')} Meal timing around your ${esc(p.gym_start.slice(0, 5))}–${esc(p.gym_end.slice(0, 5))} workout</h3>
      <div class="list">${mealSchedule(p.gym_start, p.gym_end).map((m) => `<div class="list-item"><div style="min-width:150px"><strong>${esc(m.label)}</strong><div class="small muted">${esc(m.time)}</div></div><div class="grow small">${esc(m.idea)}</div></div>`).join('')}</div>
    </section>
  </div>`;
  refreshIcons(root);
}

function bind(root) {
  root.addEventListener('change', (e) => { if (e.target.id === 'meal') state.meal = e.target.value; });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.act === 'prev' || b.dataset.act === 'next') {
        state.date = addDays(state.date, b.dataset.act === 'prev' ? -1 : 1);
        await load(); draw(root);
      } else if (b.dataset.addFood) {
        await addFood(state.foods.find((f) => f.id === b.dataset.addFood), Number(b.dataset.servings), state.meal);
        draw(root);
      } else if (b.dataset.del) {
        state.entries = state.entries.filter((x) => x.id !== b.dataset.del);
        api.deleteEntry(b.dataset.del);
        draw(root);
      } else if (b.dataset.water) {
        const ml = Number(b.dataset.water);
        const id = crypto.randomUUID();
        state.water.push({ id, amount_ml: ml });
        api.addWater(state.date, ml, id);
        draw(root);
      } else if (b.dataset.act === 'water-undo') {
        const w = state.water.pop();
        if (w) api.deleteWater(w.id);
        draw(root);
      } else if (b.dataset.act === 'search') {
        const picked = await searchDialog();
        if (picked) { await addFood(picked.food, picked.servings, picked.meal, picked.notes, picked.time); draw(root); }
      } else if (b.dataset.act === 'custom') {
        const f = await customFoodDialog();
        if (f) { state.foods.push(f); toast(`${f.name} added to your foods`, 'success'); draw(root); }
      }
    } catch (err) { toast(err.message, 'error', 5000); }
  });
}

async function addFood(food, servings, meal, notes = '', time = null) {
  if (!food) throw new Error('Food not found');
  const m = scaleFood(food, servings);
  const now = new Date();
  const eaten_at = time || (state.date === app.today()
    ? `${String(Math.floor(minutesInTz(now, app.tz()) / 60)).padStart(2, '0')}:${String(minutesInTz(now, app.tz()) % 60).padStart(2, '0')}` : null);
  const entry = { entry_date: state.date, meal, eaten_at, food_id: food.id, food_name: food.name, servings, ...m, is_estimate: food.is_estimate, notes };
  const id = crypto.randomUUID();
  state.entries.push({ id, ...entry });
  api.addEntry({ id, ...entry });
  toast(`Added ${food.name} · ${fmt(m.protein_g, 1)} g protein`, 'success');
}

function searchDialog() {
  return dialog({
    title: 'Add food', wide: true,
    body: `<input type="search" name="q" placeholder="Search foods (eggs, dal, rice…)" aria-label="Search foods">
      <div class="list" id="fl" style="margin-top:10px;max-height:38vh;overflow:auto"></div>
      <form id="ff" class="form-grid section-gap" hidden>
        <div class="field" style="grid-column:1/-1"><span>Selected</span><strong id="fname"></strong></div>
        <label class="field"><span>Servings</span><input name="servings" type="number" inputmode="decimal" step="0.25" min="0.25" max="50" value="1" required></label>
        <label class="field"><span>Meal</span><select name="meal">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}" ${k === state.meal ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Time</span><input name="time" type="time"></label>
        <label class="field" style="grid-column:1/-1"><span>Notes</span><input name="notes" maxlength="300"></label>
        <p id="fprev" class="notice" style="grid-column:1/-1;margin:0"></p>
      </form>`,
    actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok disabled>Add to log</button>',
    bind: (d, close) => {
      let food = null;
      const list = d.querySelector('#fl'), form = d.querySelector('#ff'), ok = d.querySelector('[data-ok]');
      const drawList = (q = '') => {
        const t = q.toLowerCase();
        list.innerHTML = state.foods.filter((f) => !t || f.name.toLowerCase().includes(t)).slice(0, 50).map((f) => `<button type="button" class="list-item" data-f="${esc(f.id)}" style="background:none;border:0;border-bottom:1px solid var(--line-soft);color:inherit;width:100%;text-align:left;cursor:pointer">
          <div class="grow"><strong>${esc(f.name)}</strong><div class="small muted">${esc(f.serving_desc)} · ${fmt(f.protein_g, 1)} g protein · ${fmt(f.kcal)} kcal ${f.user_id ? '· yours' : '· estimate'}</div></div></button>`).join('') || '<p class="muted">No match. Add it as a custom food.</p>';
      };
      const preview = () => {
        if (!food) return;
        const s = Number(form.servings.value);
        if (!(s > 0)) { d.querySelector('#fprev').textContent = 'Enter servings above 0.'; ok.disabled = true; return; }
        const m = scaleFood(food, s);
        d.querySelector('#fprev').textContent = `${fmt(m.protein_g, 1)} g protein · ${fmt(m.carbs_g)} g carbs · ${fmt(m.fat_g)} g fat · ${fmt(m.kcal)} kcal (estimate)`;
        ok.disabled = false;
      };
      drawList();
      d.querySelector('[name=q]').addEventListener('input', (e) => drawList(e.target.value));
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        food = state.foods.find((f) => f.id === b.dataset.f);
        form.hidden = false; d.querySelector('#fname').textContent = `${food.name} (${food.serving_desc} per serving)`;
        preview(); form.servings.focus();
      });
      form.addEventListener('input', preview);
      ok.addEventListener('click', () => close({ food, servings: Number(form.servings.value), meal: form.meal.value, notes: form.notes.value.trim(), time: form.time.value || null }));
    },
  });
}

function customFoodDialog() {
  return dialog({
    title: 'Custom food',
    body: `<form class="form-grid" id="cf">
      <label class="field" style="grid-column:1/-1"><span>Name</span><input name="name" required maxlength="120"></label>
      <label class="field"><span>Serving</span><input name="serving_desc" value="1 serving" maxlength="60"></label>
      <label class="field"><span>Calories</span><input name="kcal" type="number" min="0" step="1" required></label>
      <label class="field"><span>Protein (g)</span><input name="protein_g" type="number" min="0" step="0.1" required></label>
      <label class="field"><span>Carbs (g)</span><input name="carbs_g" type="number" min="0" step="0.1" required></label>
      <label class="field"><span>Fat (g)</span><input name="fat_g" type="number" min="0" step="0.1" required></label>
      <p class="small muted" style="grid-column:1/-1">Use the package label where possible. Values are stored as estimates.</p></form>`,
    actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save food</button>',
    bind: (d, close) => d.querySelector('[data-ok]').addEventListener('click', async () => {
      const form = d.querySelector('#cf');
      clearErrors(form);
      const v = formData(form);
      if (!v.name) return fieldError(form, 'name', 'Give the food a name.');
      for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) if (v[k] == null || v[k] < 0) return fieldError(form, k, 'Enter 0 or more.');
      try { const res = await api.addFood(v); close(res.data); } catch (err) { fieldError(form, 'name', err.message); }
    }),
  });
}
