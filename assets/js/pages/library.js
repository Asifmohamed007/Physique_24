import { app } from '../app.js';
import { esc, icon, dialog, emptyState, refreshIcons } from '../core/ui.js';
import { exerciseMedia, videoLink } from '../core/media.js';

const GROUPS = ['all', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const EQUIP = ['all', 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export async function render(root) {
  const state = { q: '', group: 'all', equip: 'all' };
  root.innerHTML = `
    <div class="stack">
      <input type="search" id="q" placeholder="Search by name, muscle or equipment" aria-label="Search exercises">
      <div class="chips" id="groups">${GROUPS.map((g) => `<button class="chip" data-g="${g}" aria-pressed="${g === 'all'}">${g === 'all' ? 'All muscles' : cap(g)}</button>`).join('')}</div>
      <div class="chips" id="equip">${EQUIP.map((g) => `<button class="chip" data-e="${g}" aria-pressed="${g === 'all'}">${g === 'all' ? 'All equipment' : cap(g)}</button>`).join('')}</div>
      <div id="grid"></div>
      <p class="small muted">Illustrations are shown where no licensed photo has been added. "Find demo videos" opens a search; check that the technique matches the instructions here. See docs/MEDIA.md to add your own licensed media.</p>
    </div>`;

  const draw = () => {
    const q = state.q.toLowerCase();
    const list = app.exercises.filter((x) =>
      (state.group === 'all' || x.muscle_group === state.group) &&
      (state.equip === 'all' || x.equipment === state.equip) &&
      (!q || [x.name, x.equipment, x.muscle_group, ...(x.primary_muscles || []), ...(x.secondary_muscles || [])].join(' ').toLowerCase().includes(q)));
    const grouped = {};
    for (const x of list) (grouped[x.muscle_group] ||= []).push(x);
    root.querySelector('#grid').innerHTML = list.length
      ? Object.entries(grouped).map(([g, xs]) => `<h2 class="section-gap" style="margin-top:22px">${cap(g)} <span class="muted small">${xs.length}</span></h2>
          <div class="lib-grid">${xs.map((x) => `<button class="lib-card" data-id="${esc(x.id)}">
            <div class="lib-media">${exerciseMedia(x)}</div>
            <div class="lib-body"><h3>${esc(x.name)}</h3><div class="small muted">${esc((x.primary_muscles || []).join(', '))} · ${esc(x.equipment)}</div>
            <div class="small" style="margin-top:6px"><span class="badge">${x.default_sets} × ${x.rep_min}–${x.rep_max}</span></div></div>
          </button>`).join('')}</div>`).join('')
      : emptyState('search-x', 'No exercises match', 'Try a different search or clear the filters.');
    refreshIcons(root);
  };
  draw();

  root.querySelector('#q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]'), q = e.target.closest('[data-e]'), c = e.target.closest('[data-id]');
    if (g) { state.group = g.dataset.g; root.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', b === g)); draw(); }
    if (q) { state.equip = q.dataset.e; root.querySelectorAll('[data-e]').forEach((b) => b.setAttribute('aria-pressed', b === q)); draw(); }
    if (c) openExercise(app.exById[c.dataset.id]);
  });
}

export function openExercise(x) {
  const vid = videoLink(x);
  const alts = (x.alternatives || []).map((s) => app.exBySlug[s]).filter(Boolean);
  return dialog({
    title: x.name, wide: true,
    body: `<div class="grid g2">
      <div class="lib-media" style="border-radius:14px">${exerciseMedia(x)}</div>
      <div>
        <p><strong>Primary:</strong> ${esc((x.primary_muscles || []).join(', '))}<br><strong>Secondary:</strong> ${esc((x.secondary_muscles || []).join(', ') || '—')}<br>
        <strong>Equipment:</strong> ${esc(x.equipment)}<br><strong>Suggested:</strong> ${x.default_sets} sets × ${x.rep_min}–${x.rep_max} reps${x.per_side ? ' per side' : ''}</p>
        <a class="btn btn-cyan btn-sm" href="${esc(vid.href)}" target="_blank" rel="noopener">${icon('video')} ${esc(vid.label)}</a>
      </div></div>
      <h3 class="section-gap">How to do it</h3><p>${esc(x.instructions)}</p>
      <h3>Safety</h3><p class="muted">${esc(x.safety_tips)}</p>
      ${alts.length ? `<h3>Alternatives</h3><div class="chips" style="flex-wrap:wrap">${alts.map((a) => `<span class="chip">${esc(a.name)}</span>`).join('')}</div>` : ''}
      ${x.image_attribution || x.media_source_url ? `<p class="small muted section-gap">Media: ${esc(x.image_attribution || '')} ${x.media_source_url ? `<a href="${esc(x.media_source_url)}" target="_blank" rel="noopener">source</a>` : ''}</p>` : ''}`,
  });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
