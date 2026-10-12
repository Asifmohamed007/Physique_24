// Data access layer. Every query is scoped to the signed-in user by RLS on the
// server; user_id is also set explicitly on inserts so policies can check it.
import { sb } from './supabase.js';
import { write, tracked, flush } from './sync.js';
import { PHOTO_BUCKET } from './config.js';

let UID = null;
export const setUser = (id) => { UID = id; };
export const uid = () => UID;

const must = (res) => { if (res.error) throw res.error; return res.data; };
const uuid = () => crypto.randomUUID();

// ---------- profile & settings ----------
export async function loadProfile() {
  let p = must(await sb.from('profiles').select('*').eq('id', UID).maybeSingle());
  let s = must(await sb.from('user_settings').select('*').eq('user_id', UID).maybeSingle());
  if (!p || !s) {
    must(await sb.rpc('ensure_my_program'));
    p = must(await sb.from('profiles').select('*').eq('id', UID).single());
    s = must(await sb.from('user_settings').select('*').eq('user_id', UID).single());
  }
  return { profile: p, settings: s };
}
export const saveProfile = (patch) => tracked(sb.from('profiles').update(patch).eq('id', UID).select().single());
export const saveSettings = (patch) => tracked(sb.from('user_settings').update(patch).eq('user_id', UID).select().single());

// ---------- library ----------
export async function loadExercises() {
  return must(await sb.from('exercises').select('*').order('muscle_group').order('name'));
}
export async function loadFoods() {
  return must(await sb.from('foods').select('*').order('name'));
}
export const addFood = (f) => tracked(sb.from('foods').insert({ ...f, user_id: UID, is_estimate: true, source: 'Added by you' }).select().single());

// ---------- templates & schedule ----------
export async function loadTemplates() {
  const rows = must(await sb.from('workout_templates')
    .select('*, template_exercises(*, exercises(*))')
    .eq('archived', false).order('created_at'));
  for (const t of rows) t.template_exercises.sort((a, b) => a.position - b.position);
  return rows;
}
export async function ensureProgram() { must(await sb.rpc('ensure_my_program')); }

export const saveTemplate = (t) => tracked(sb.from('workout_templates')
  .upsert({ id: t.id || uuid(), user_id: UID, name: t.name, focus: t.focus, muscle_tags: t.muscle_tags || [] }).select().single());

export async function saveTemplateExercises(templateId, list) {
  // replace the template's exercise list (templates are plans; history is snapshotted separately)
  await tracked(sb.from('template_exercises').delete().eq('template_id', templateId));
  if (!list.length) return;
  await tracked(sb.from('template_exercises').insert(list.map((x, i) => ({
    user_id: UID, template_id: templateId, exercise_id: x.exercise_id, position: i,
    target_sets: x.target_sets, rep_min: x.rep_min, rep_max: x.rep_max, rest_seconds: x.rest_seconds || null,
  }))));
}

export async function loadSchedule() {
  return must(await sb.from('schedule_days').select('weekday, template_id, effective_from').order('effective_from'));
}
/** Save a new version of the weekly schedule starting on `from`. Past days keep the old version. */
export const saveSchedule = (map, from) => tracked(sb.from('schedule_days').upsert(
  Object.entries(map).map(([weekday, template_id]) => ({ user_id: UID, weekday: Number(weekday), template_id: template_id || null, effective_from: from })),
  { onConflict: 'user_id,weekday,effective_from' },
));

export async function loadOverrides() {
  return must(await sb.from('scheduled_workouts').select('*').order('scheduled_date'));
}
export const saveOverride = (row) => tracked(sb.from('scheduled_workouts')
  .upsert({ ...row, user_id: UID }, { onConflict: 'user_id,scheduled_date,template_name' }).select().single());
export const deleteOverride = (id) => tracked(sb.from('scheduled_workouts').delete().eq('id', id));

// ---------- sessions ----------
export async function loadSessions({ status = 'completed', from, to, limit } = {}) {
  let q = sb.from('workout_sessions').select('*').eq('status', status).order('session_date', { ascending: false }).order('started_at', { ascending: false });
  if (from) q = q.gte('session_date', from);
  if (to) q = q.lte('session_date', to);
  if (limit) q = q.limit(limit);
  return must(await q);
}
export async function loadSessionFull(id) {
  const s = must(await sb.from('workout_sessions').select('*, session_exercises(*, exercise_sets(*))').eq('id', id).maybeSingle());
  if (s) {
    s.session_exercises.sort((a, b) => a.position - b.position);
    for (const e of s.session_exercises) e.exercise_sets.sort((a, b) => a.set_number - b.set_number);
  }
  return s;
}
export async function loadActiveSession() {
  const row = must(await sb.from('workout_sessions').select('id').eq('status', 'in_progress').maybeSingle());
  return row ? loadSessionFull(row.id) : null;
}

/** Most recent completed performance for each exercise name. */
export async function previousPerformance(names, excludeSessionId) {
  if (!names.length) return {};
  const rows = must(await sb.from('session_exercises')
    .select('exercise_name, target_sets, rep_min, rep_max, session_id, exercise_sets(set_number, weight_kg, reps, completed), workout_sessions!inner(session_date, status, started_at)')
    .in('exercise_name', names)
    .eq('workout_sessions.status', 'completed')
    .neq('session_id', excludeSessionId || '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .limit(names.length * 6));
  const out = {};
  for (const r of rows) {
    r.exercise_sets.sort((a, b) => a.set_number - b.set_number);
    (out[r.exercise_name] ||= []).push({ ...r, sets: r.exercise_sets, session_date: r.workout_sessions.session_date });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.session_date < b.session_date ? 1 : -1));
  return out; // name -> history newest first
}

/** Insert a new in-progress session with snapshot exercises. Not queued: needs the server to enforce "one active workout". */
export async function startSession({ id, template, plannedDate, sessionDate, exercises, restDefault }) {
  must(await sb.from('workout_sessions').insert({
    id, user_id: UID, template_id: template?.id || null, name: template?.name || 'Custom workout',
    focus: template?.focus || '', session_date: sessionDate, planned_date: plannedDate || null,
  }));
  if (exercises.length) {
    must(await sb.from('session_exercises').insert(exercises.map((e, i) => ({
      id: e.id, user_id: UID, session_id: id, exercise_id: e.exercise_id, exercise_name: e.exercise_name,
      muscle_group: e.muscle_group, equipment: e.equipment, position: i, target_sets: e.target_sets,
      rep_min: e.rep_min, rep_max: e.rep_max, rest_seconds: e.rest_seconds || restDefault,
    }))));
  }
  return loadSessionFull(id);
}

export const queueSessionExercise = (e) => write({ table: 'session_exercises', kind: 'upsert', payload: {
  id: e.id, user_id: UID, session_id: e.session_id, exercise_id: e.exercise_id, exercise_name: e.exercise_name,
  muscle_group: e.muscle_group, equipment: e.equipment, position: e.position, target_sets: e.target_sets,
  rep_min: e.rep_min, rep_max: e.rep_max, rest_seconds: e.rest_seconds, notes: e.notes || '' } });
export const queueDeleteSessionExercise = (id) => write({ table: 'session_exercises', kind: 'delete', match: { id } });
export const queueSet = (s) => write({ table: 'exercise_sets', kind: 'upsert', payload: {
  id: s.id, user_id: UID, session_exercise_id: s.session_exercise_id, set_number: s.set_number,
  weight_kg: s.weight_kg, reps: s.reps, completed: !!s.completed, completed_at: s.completed ? (s.completed_at || new Date().toISOString()) : null } });
export const queueDeleteSet = (id) => write({ table: 'exercise_sets', kind: 'delete', match: { id } });
export const queueSessionPatch = (id, patch) => write({ table: 'workout_sessions', kind: 'update', match: { id }, payload: patch });

export async function finishSession(id, patch) {
  const ok = await flush();
  if (!ok) throw new Error('Some sets are still waiting to save. Reconnect, then finish the workout.');
  return must(await tracked(sb.from('workout_sessions').update({ ...patch, status: 'completed' }).eq('id', id).select().single()));
}
export async function discardSession(id) {
  await flush();
  return tracked(sb.from('workout_sessions').delete().eq('id', id));
}

// ---------- records & suggestions ----------
export async function allTimeBests(names, excludeSessionId) {
  if (!names.length) return {};
  const rows = must(await sb.from('session_exercises')
    .select('exercise_name, equipment, session_id, exercise_sets(weight_kg, reps, completed), workout_sessions!inner(status)')
    .in('exercise_name', names).eq('workout_sessions.status', 'completed')
    .neq('session_id', excludeSessionId));
  const out = {};
  for (const r of rows) (out[r.exercise_name] ||= []).push(r.exercise_sets);
  return out; // name -> [sets[]]
}
export const savePRs = (list) => list.length ? tracked(sb.from('personal_records').upsert(list.map((p) => ({ ...p, user_id: UID })), { onConflict: 'user_id,exercise_name,record_type,session_id', ignoreDuplicates: true })) : null;
export async function loadPRs(limit = 50) {
  return must(await sb.from('personal_records').select('*').order('achieved_on', { ascending: false }).order('created_at', { ascending: false }).limit(limit));
}
export async function loadPendingSuggestions() {
  return must(await sb.from('progression_suggestions').select('*').eq('status', 'pending').order('created_at', { ascending: false }));
}
export async function saveSuggestions(list) {
  if (!list.length) return;
  const names = list.map((x) => x.exercise_name);
  await tracked(sb.from('progression_suggestions').update({ status: 'superseded' }).eq('status', 'pending').in('exercise_name', names));
  await tracked(sb.from('progression_suggestions').upsert(list.map((x) => ({ ...x, user_id: UID })), { onConflict: 'user_id,exercise_name,based_on_session_id', ignoreDuplicates: true }));
}
export const resolveSuggestion = (id, patch) => tracked(sb.from('progression_suggestions').update(patch).eq('id', id));

// ---------- strength history for charts ----------
export async function exerciseHistory(name) {
  const rows = must(await sb.from('session_exercises')
    .select('exercise_sets(weight_kg, reps, completed), workout_sessions!inner(session_date, status)')
    .eq('exercise_name', name).eq('workout_sessions.status', 'completed'));
  return rows.map((r) => ({ date: r.workout_sessions.session_date, sets: r.exercise_sets })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
export async function loggedExerciseNames() {
  const rows = must(await sb.from('session_exercises').select('exercise_name, workout_sessions!inner(status)').eq('workout_sessions.status', 'completed').limit(2000));
  return [...new Set(rows.map((r) => r.exercise_name))].sort();
}

// ---------- nutrition ----------
export async function loadNutrition(from, to = from) {
  return must(await sb.from('nutrition_entries').select('*').gte('entry_date', from).lte('entry_date', to).order('eaten_at', { nullsFirst: true }).order('created_at'));
}
export const addEntry = ({ id = uuid(), ...e }) => write({ table: 'nutrition_entries', kind: 'upsert', payload: { id, user_id: UID, ...e } });
export const deleteEntry = (id) => write({ table: 'nutrition_entries', kind: 'delete', match: { id } });
export async function loadWater(from, to = from) {
  return must(await sb.from('water_intake').select('*').gte('entry_date', from).lte('entry_date', to).order('logged_at'));
}
export const addWater = (entry_date, amount_ml, id = uuid()) => write({ table: 'water_intake', kind: 'upsert', payload: { id, user_id: UID, entry_date, amount_ml } });
export const deleteWater = (id) => write({ table: 'water_intake', kind: 'delete', match: { id } });

// ---------- measurements ----------
export async function loadMeasurements() {
  return must(await sb.from('body_measurements').select('*').order('measured_on'));
}
export const saveMeasurement = (m) => tracked(sb.from('body_measurements').upsert({ ...m, user_id: UID }, { onConflict: 'user_id,measured_on' }).select().single());
export const deleteMeasurement = (id) => tracked(sb.from('body_measurements').delete().eq('id', id));

// ---------- photos (private bucket, signed URLs) ----------
export async function loadPhotos() {
  return must(await sb.from('progress_photos').select('*').order('taken_on', { ascending: false }));
}
export async function signedUrls(paths, seconds = 600) {
  if (!paths.length) return {};
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, seconds);
  if (error) throw error;
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
export async function uploadPhoto(file, { pose, taken_on, notes }) {
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${UID}/${uuid()}.${ext}`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  const res = await sb.from('progress_photos').insert({ user_id: UID, storage_path: path, pose, taken_on, notes }).select().single();
  if (res.error) { await sb.storage.from(PHOTO_BUCKET).remove([path]); throw res.error; }
  return res.data;
}
export async function deletePhoto(photo) {
  const rm = await sb.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  if (rm.error) throw rm.error;
  return tracked(sb.from('progress_photos').delete().eq('id', photo.id));
}

// ---------- achievements ----------
export async function loadAchievements() {
  const [all, mine] = await Promise.all([
    sb.from('achievements').select('*').order('sort'),
    sb.from('user_achievements').select('*'),
  ]);
  return { all: must(all), earned: Object.fromEntries(must(mine).map((r) => [r.code, r.earned_at])) };
}
export async function awardAchievements(codes) {
  if (!codes.length) return;
  await sb.from('user_achievements').upsert(codes.map((code) => ({ user_id: UID, code })), { onConflict: 'user_id,code', ignoreDuplicates: true });
}

// ---------- export & deletion ----------
export const EXPORT_TABLES = ['profiles', 'user_settings', 'workout_templates', 'template_exercises', 'schedule_days',
  'scheduled_workouts', 'workout_sessions', 'session_exercises', 'exercise_sets', 'personal_records',
  'progression_suggestions', 'nutrition_entries', 'water_intake', 'body_measurements', 'progress_photos', 'user_achievements'];

export async function exportTable(table) {
  const all = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select('*').range(from, from + page - 1);
    q = table === 'profiles' ? q.eq('id', UID) : q.eq('user_id', UID);
    const rows = must(await q);
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}
export async function exportCustomFoodsAndExercises() {
  const [f, e] = await Promise.all([sb.from('foods').select('*').eq('user_id', UID), sb.from('exercises').select('*').eq('user_id', UID)]);
  return { foods: must(f), exercises: must(e) };
}

export async function deleteAccount() {
  // 1) remove every photo file in the user's folder, 2) delete the auth user (cascades all rows)
  for (;;) {
    const { data, error } = await sb.storage.from(PHOTO_BUCKET).list(UID, { limit: 100 });
    if (error) throw error;
    if (!data.length) break;
    const rm = await sb.storage.from(PHOTO_BUCKET).remove(data.map((f) => `${UID}/${f.name}`));
    if (rm.error) throw rm.error;
  }
  must(await sb.rpc('delete_my_account'));
  await sb.auth.signOut();
}

/** Recent completed exercise rows with sets, for strength-trend summaries. */
export async function recentExerciseRows(limit = 400) {
  const rows = must(await sb.from('session_exercises')
    .select('exercise_name, exercise_sets(weight_kg, reps, completed), workout_sessions!inner(session_date, status)')
    .eq('workout_sessions.status', 'completed').order('created_at', { ascending: false }).limit(limit));
  return rows.map((r) => ({ name: r.exercise_name, date: r.workout_sessions.session_date, sets: r.exercise_sets }));
}
export const archiveTemplate = (id) => tracked(sb.from('workout_templates').update({ archived: true }).eq('id', id));

/** Recent completed sessions summarised for the planner: duration and which exercises were finished. */
export async function recentHistory(limit = 5) {
  const rows = must(await sb.from('workout_sessions')
    .select('id, name, started_at, ended_at, session_date, session_exercises(target_sets, rest_seconds, exercise_sets(completed))')
    .eq('status', 'completed').order('session_date', { ascending: false }).order('started_at', { ascending: false }).limit(limit));
  return rows.map((s) => ({
    name: s.name,
    minutes: s.ended_at ? (new Date(s.ended_at) - new Date(s.started_at)) / 60000 : 0,
    exercises: (s.session_exercises || []).map((e) => ({ target_sets: e.target_sets, rest_seconds: e.rest_seconds, done: (e.exercise_sets || []).some((x) => x.completed) })),
  }));
}
