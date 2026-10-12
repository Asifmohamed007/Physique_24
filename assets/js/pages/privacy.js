import { app, subnav } from '../app.js';
import * as api from '../core/api.js';
import { esc, icon, toast, dialog, download, toCSV } from '../core/ui.js';

const LABELS = {
  workout_sessions: 'Workouts', session_exercises: 'Workout exercises', exercise_sets: 'Sets (weights & reps)',
  nutrition_entries: 'Food log', water_intake: 'Water log', body_measurements: 'Body measurements',
  personal_records: 'Personal records', progress_photos: 'Photo list (metadata)', scheduled_workouts: 'Skips & reschedules',
};

export async function render(root) {
  root.innerHTML = `${subnav('privacy', 'settings')}
  <div class="stack">
    <section class="card">
      <h3>${icon('shield-check')} How your data is protected</h3>
      <ul class="muted" style="line-height:1.8;padding-left:1.2em;margin:0">
        <li>Every record is tied to your account. The database itself refuses requests for anyone else's rows (Row Level Security) — it doesn't rely on the app hiding them.</li>
        <li>Progress photos live in a private folder only your account can open, and are shown through links that expire after 10 minutes.</li>
        <li>Passwords are handled by Supabase Auth and are never stored in plain text or seen by this app.</li>
        <li>There are no public profiles and no sharing.</li>
      </ul>
    </section>
    <section class="card">
      <h3>${icon('download')} Export your records</h3>
      <p class="muted">A full JSON backup contains everything in one file. CSV files open in Excel or Google Sheets.</p>
      <button class="btn btn-primary" data-x="json">${icon('file-json')} Download full backup (JSON)</button>
      <div class="chips" style="flex-wrap:wrap;margin-top:14px">${Object.entries(LABELS).map(([t, l]) => `<button class="chip" data-csv="${t}">${icon('file-spreadsheet')} ${esc(l)}</button>`).join('')}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:14px" data-x="photos">${icon('images')} Get download links for my photos</button>
    </section>
    <section class="card" style="border-color:rgba(255,100,100,.35)">
      <h3 style="color:var(--danger)">${icon('trash-2')} Delete account</h3>
      <p class="muted">Permanently deletes your account, every workout, set, meal, measurement, photo and setting. This cannot be undone. Download a backup first if you might want your history.</p>
      <button class="btn btn-danger" data-x="delete">Delete my account and data</button>
    </section>
  </div>`;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const stamp = app.today();
    try {
      if (b.dataset.x === 'json') {
        b.setAttribute('aria-busy', 'true');
        const out = { exported_at: new Date().toISOString(), app: 'Physique 24', user_email: app.user.email, tables: {} };
        for (const t of api.EXPORT_TABLES) out.tables[t] = await api.exportTable(t);
        Object.assign(out.tables, await api.exportCustomFoodsAndExercises());
        download(`physique-backup-${stamp}.json`, JSON.stringify(out, null, 2));
        const n = Object.values(out.tables).reduce((a, r) => a + r.length, 0);
        toast(`Backup downloaded: ${n} records`, 'success');
        b.removeAttribute('aria-busy');
      }
      if (b.dataset.csv) {
        const rows = await api.exportTable(b.dataset.csv);
        if (!rows.length) { toast('No records to export yet.'); return; }
        download(`${b.dataset.csv}-${stamp}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
      }
      if (b.dataset.x === 'photos') {
        const photos = await api.loadPhotos();
        if (!photos.length) { toast('No photos stored.'); return; }
        const urls = await api.signedUrls(photos.map((p) => p.storage_path), 3600);
        dialog({ title: 'Your photos', body: `<p class="small muted">Links work for one hour and only for you.</p><div class="list">${photos.map((p) => `<div class="list-item"><span class="grow">${esc(p.taken_on)} · ${esc(p.pose)}</span><a class="btn btn-sm" href="${esc(urls[p.storage_path] || '#')}" target="_blank" rel="noopener" download>Open</a></div>`).join('')}</div>` });
      }
      if (b.dataset.x === 'delete') {
        const ok = await dialog({
          title: 'Delete account permanently',
          body: `<p>Type <strong>DELETE</strong> to confirm. Everything for ${esc(app.user.email)} will be removed.</p><input name="c" autocomplete="off" aria-label="Type DELETE to confirm">`,
          actions: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" data-ok disabled>Delete everything</button>',
          bind: (d, close) => {
            const i = d.querySelector('input'), ok2 = d.querySelector('[data-ok]');
            i.addEventListener('input', () => { ok2.disabled = i.value !== 'DELETE'; });
            ok2.addEventListener('click', () => close(true));
          },
        });
        if (!ok) return;
        b.setAttribute('aria-busy', 'true');
        await api.deleteAccount();
        Object.keys(localStorage).filter((k) => k.startsWith('fitapp:')).forEach((k) => localStorage.removeItem(k));
        location.replace('login.html?deleted=1');
      }
    } catch (err) { b.removeAttribute('aria-busy'); toast(err.message, 'error', 6000); }
  });
}
