import { app, subnav, rerender } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, toast, confirmDialog, emptyState, dialog } from '../core/ui.js';
import { formatShort } from '../logic/dates.js';

const MAX_BYTES = 8 * 1024 * 1024;

export async function render(root) {
  const photos = await api.loadPhotos();
  let urls = {};
  try { urls = await api.signedUrls(photos.map((p) => p.storage_path)); } catch (err) { toast(`Couldn't load images: ${err.message}`, 'error'); }
  const selected = [];

  root.innerHTML = `${subnav('photos')}
  <div class="stack">
    <div class="notice">${icon('lock')} Photos are private. They are stored in your own folder and shown through links that expire after 10 minutes. Nobody else can see them.</div>
    <form class="card" id="up">
      <h3>${icon('camera')} Add a progress photo</h3>
      <p class="small muted">Every 4 weeks: front, side and back, same lighting and distance.</p>
      <div class="form-grid">
        <label class="field" style="grid-column:1/-1"><span>Photo (JPG, PNG, WebP or HEIC, max 8 MB)</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></label>
        <label class="field"><span>Pose</span><select name="pose"><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option><option value="other">Other</option></select></label>
        <label class="field"><span>Date taken</span><input type="date" name="taken_on" value="${app.today()}" max="${app.today()}"></label>
        <label class="field" style="grid-column:1/-1"><span>Note</span><input name="notes" maxlength="300"></label>
      </div>
      <button class="btn btn-primary" style="margin-top:12px" type="submit">${icon('upload')} Upload privately</button>
    </form>
    <div class="card">
      <div class="card-head"><h3>${icon('images')} Gallery</h3><button class="btn btn-sm btn-cyan" id="cmp" disabled>${icon('columns-2')} Compare 2</button></div>
      ${photos.length ? `<p class="small muted">Tap two photos to compare before and after.</p><div class="photo-grid">${photos.map((p) => `
        <button class="photo" data-id="${esc(p.id)}" aria-pressed="false">
          ${urls[p.storage_path] ? `<img src="${esc(urls[p.storage_path])}" alt="${esc(p.pose)} photo, ${esc(formatShort(p.taken_on))}" loading="lazy">` : `<span class="muted small" style="display:grid;place-items:center;height:100%">Image unavailable</span>`}
          <span class="cap">${esc(formatShort(p.taken_on))} · ${esc(p.pose)}</span>
        </button>`).join('')}</div>`
      : emptyState('camera', 'No photos yet', 'Your first set of photos becomes the "before" for comparisons.')}
    </div>
  </div>`;

  root.querySelector('#up').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const file = f.file.files[0];
    if (!file) return toast('Choose a photo first.', 'error');
    if (file.size > MAX_BYTES) return toast('That photo is over 8 MB. Use a smaller image.', 'error');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return toast('Use a JPG, PNG, WebP or HEIC image.', 'error');
    const btn = f.querySelector('[type=submit]');
    btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Uploading…';
    try {
      await api.uploadPhoto(file, { pose: f.pose.value, taken_on: f.taken_on.value || app.today(), notes: f.notes.value.trim() });
      toast('Photo saved privately', 'success');
      rerender();
    } catch (err) { toast(`Upload failed: ${err.message}`, 'error', 6000); btn.removeAttribute('aria-busy'); btn.textContent = 'Upload privately'; }
  });

  root.addEventListener('click', async (e) => {
    const card = e.target.closest('.photo');
    if (card) {
      const id = card.dataset.id;
      const at = selected.indexOf(id);
      if (at >= 0) selected.splice(at, 1); else { selected.push(id); if (selected.length > 2) selected.shift(); }
      root.querySelectorAll('.photo').forEach((c) => c.setAttribute('aria-pressed', selected.includes(c.dataset.id)));
      root.querySelector('#cmp').disabled = selected.length === 0;
      root.querySelector('#cmp').innerHTML = `${icon('columns-2')} ${selected.length === 2 ? 'Compare' : selected.length === 1 ? 'View' : 'Compare 2'}`;
      window.lucide?.createIcons();
    }
    if (e.target.closest('#cmp')) {
      const chosen = selected.map((id) => photos.find((p) => p.id === id)).sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1));
      if (chosen.length === 1) return viewPhoto(chosen[0], urls);
      compare(chosen, urls);
    }
  });
}

function viewPhoto(p, urls) {
  return dialog({
    title: `${p.pose} · ${formatShort(p.taken_on)}`,
    body: `<img src="${esc(urls[p.storage_path] || '')}" alt="" style="border-radius:14px;margin:0 auto;max-height:65vh">${p.notes ? `<p class="muted" style="margin-top:10px">${esc(p.notes)}</p>` : ''}`,
    actions: '<button class="btn btn-danger" data-del>Delete photo</button><button class="btn btn-ghost" data-close>Close</button>',
    bind: (d, close) => d.querySelector('[data-del]').addEventListener('click', async () => {
      close(); if (!(await confirmDialog('Delete this photo permanently? It is removed from storage and cannot be recovered.', { confirmLabel: 'Delete photo', danger: true }))) return;
      try { await api.deletePhoto(p); toast('Photo deleted'); rerender(); } catch (err) { toast(err.message, 'error'); }
    }),
  });
}

function compare([before, after], urls) {
  return dialog({
    title: `${formatShort(before.taken_on)} vs ${formatShort(after.taken_on)}`, wide: true,
    body: `<div class="compare" id="cmpbox" style="--x:50%">
      <img src="${esc(urls[before.storage_path])}" alt="Before">
      <img class="after" src="${esc(urls[after.storage_path])}" alt="After">
      <span class="tag" style="left:10px">Before · ${esc(formatShort(before.taken_on))}</span>
      <span class="tag" style="right:10px">After · ${esc(formatShort(after.taken_on))}</span>
      <div class="handle"></div></div>
      <input type="range" min="0" max="100" value="50" aria-label="Compare position" style="margin-top:12px">`,
    bind: (d) => {
      const box = d.querySelector('#cmpbox'), range = d.querySelector('input[type=range]');
      const set = (pctX) => { box.style.setProperty('--x', `${pctX}%`); range.value = pctX; };
      range.addEventListener('input', () => set(range.value));
      const move = (ev) => { const r = box.getBoundingClientRect(); set(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100))); };
      box.addEventListener('pointerdown', (ev) => { box.setPointerCapture(ev.pointerId); move(ev); box.addEventListener('pointermove', move); });
      box.addEventListener('pointerup', () => box.removeEventListener('pointermove', move));
    },
  });
}
