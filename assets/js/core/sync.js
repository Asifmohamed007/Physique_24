// Save status + offline-safe write queue.
// Every queued write is idempotent (upsert by client-generated id, or delete by
// match), so retrying after a dropped connection never creates duplicates.
// "Saved" is only shown after the server confirms.
import { sb } from './supabase.js';

const listeners = new Set();
let state = { status: 'idle', pending: 0, message: '' };
let userId = null;
let flushing = null;
let retryTimer = null;

export const getStatus = () => state;
export function onStatus(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
function emit(patch) { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); }

const qKey = () => `fitapp:queue:${userId}`;
function readQueue() { try { return JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch { return []; } }
function writeQueue(q) {
  try { localStorage.setItem(qKey(), JSON.stringify(q)); } catch { /* storage full */ }
  emit({ pending: q.length });
}

export function initSync(uid) {
  userId = uid;
  emit({ pending: readQueue().length });
  window.addEventListener('online', () => flush());
  window.addEventListener('offline', () => emit({ status: 'offline', message: 'Offline — changes will wait here' }));
  if (navigator.onLine) flush();
}

export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const m = String(err?.message || err || '').toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request') || m.includes('load failed') || m.includes('timeout');
}
export const isAuthError = (err) => err?.status === 401 || err?.code === 'PGRST301' || /jwt expired|invalid jwt|not authenticated/i.test(err?.message || '');

async function execute(op) {
  const t = sb.from(op.table);
  let res;
  if (op.kind === 'upsert') res = await t.upsert(op.payload, { onConflict: op.onConflict || 'id' });
  else if (op.kind === 'delete') res = await t.delete().match(op.match);
  else if (op.kind === 'update') res = await t.update(op.payload).match(op.match);
  else throw new Error(`Unknown op ${op.kind}`);
  if (res.error) throw res.error;
  return res;
}

/**
 * Queue a write and try to send it. Network failures stay queued and retry;
 * validation errors are shown and dropped (retrying would fail again).
 * Resolves true only when the server has confirmed everything in the queue.
 */
export function write(op) {
  const queue = readQueue();
  const key = op.kind === 'upsert' && op.payload?.id ? `${op.table}:${op.payload.id}` : null;
  const kept = key ? queue.filter((q) => q.key !== key) : queue; // keep only the newest value of a row
  kept.push({ ...op, key, qid: crypto.randomUUID() });
  writeQueue(kept);
  return flush();
}

export function flush() {
  if (flushing) return flushing.then(() => (readQueue().length ? flush() : true));
  clearTimeout(retryTimer);
  flushing = (async () => {
    if (!readQueue().length) { if (state.status !== 'error' && state.status !== 'auth') emit({ status: 'saved', message: 'Saved' }); return true; }
    if (!navigator.onLine) { emit({ status: 'offline', message: `${readQueue().length} change(s) waiting for connection` }); return false; }
    emit({ status: 'saving', message: 'Saving…' });
    let attempt = 0;
    for (;;) {
      const op = readQueue()[0];
      if (!op) break;
      try {
        await execute(op);
        writeQueue(readQueue().filter((q) => q.qid !== op.qid));
        attempt = 0;
      } catch (err) {
        if (isNetworkError(err)) {
          if (++attempt > 3) {
            emit({ status: 'offline', message: `${readQueue().length} change(s) waiting — retrying` });
            retryTimer = setTimeout(flush, 10000);
            return false;
          }
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (isAuthError(err)) {
          const { error } = await sb.auth.refreshSession();
          if (!error && attempt++ < 1) continue;
          emit({ status: 'auth', message: 'Session expired — sign in again. Your changes are kept on this device.' });
          return false;
        }
        writeQueue(readQueue().filter((q) => q.qid !== op.qid));
        emit({ status: 'error', message: `Not saved: ${friendlyError(err)}` });
        return false;
      }
    }
    emit({ status: 'saved', message: 'Saved' });
    return true;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function friendlyError(err) {
  const m = err?.message || String(err);
  if (/violates check constraint/i.test(m)) return 'a value is outside the allowed range';
  if (/duplicate key/i.test(m)) return 'this record already exists';
  if (/row-level security/i.test(m)) return 'you do not have permission to change this record';
  if (isNetworkError(err)) return 'no connection';
  return m;
}

/** Direct (non-queued) call with status reporting. Throws on failure. */
export async function tracked(promise, label = 'Saving…') {
  emit({ status: 'saving', message: label });
  try {
    const res = await promise;
    if (res?.error) throw res.error;
    emit({ status: 'saved', message: 'Saved' });
    return res;
  } catch (err) {
    emit({ status: isNetworkError(err) ? 'offline' : isAuthError(err) ? 'auth' : 'error', message: friendlyError(err) });
    throw err;
  }
}

export const pendingCount = () => readQueue().length;
export const pendingFor = (table) => readQueue().filter((q) => q.table === table);
