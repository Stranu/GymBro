/* GymBro - domain store (logica di dominio sopra IndexedDB) */
import * as db from './db.js';

export function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function normalizeTag(t) {
  return String(t).trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
}

/* ---------------- SCHEDE (workouts) ---------------- */

export async function listWorkouts() {
  const all = await db.getAll('workouts');
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getWorkout(id) {
  return db.get('workouts', id);
}

export async function createWorkout(data = {}) {
  const now = new Date().toISOString();
  const w = {
    id: uid(),
    name: data.name || 'Nuova scheda',
    note: data.note || '',
    defaults: data.defaults || { sets: '3', reps: '10', rest: '2-3 min' },
    days: data.days || [{ id: uid(), name: 'G1', items: [] }],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('workouts', w);
  return w;
}

export async function saveWorkout(w) {
  w.updatedAt = new Date().toISOString();
  await db.put('workouts', w);
  return w;
}

export async function deleteWorkout(id) {
  await db.del('workouts', id);
}

export async function duplicateWorkout(id) {
  const src = await getWorkout(id);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + ' (copia)';
  copy.archived = false;
  copy.createdAt = now;
  copy.updatedAt = now;
  // rigenera gli id interni di giorni/elementi, mantenendo i riferimenti a exerciseId
  copy.days = copy.days.map((d) => ({
    ...d,
    id: uid(),
    items: (d.items || []).map((it) => ({ ...it, id: uid() })),
  }));
  await db.put('workouts', copy);
  return copy;
}

/* ---------------- CATALOGO ESERCIZI (exercises) ---------------- */

export async function listExercises() {
  const all = await db.getAll('exercises');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export async function getExercise(id) {
  return db.get('exercises', id);
}

export async function findExerciseByName(name) {
  const nameLower = String(name).trim().toLowerCase();
  const matches = await db.getByIndex('exercises', 'nameLower', nameLower);
  return matches[0] || null;
}

/**
 * Trova o crea un esercizio nel catalogo globale (evita i doppioni per nome).
 * Unisce eventuali nuovi tag.
 */
export async function getOrCreateExercise(name, tags = []) {
  const clean = String(name).trim();
  if (!clean) return null;
  let ex = await findExerciseByName(clean);
  const normTags = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  if (ex) {
    const merged = [...new Set([...(ex.tags || []), ...normTags])];
    if (merged.length !== (ex.tags || []).length) {
      ex.tags = merged;
      await db.put('exercises', ex);
    }
    return ex;
  }
  ex = {
    id: uid(),
    name: clean,
    nameLower: clean.toLowerCase(),
    tags: normTags,
    createdAt: new Date().toISOString(),
  };
  await db.put('exercises', ex);
  return ex;
}

export async function updateExercise(ex) {
  ex.nameLower = ex.name.toLowerCase();
  ex.tags = [...new Set((ex.tags || []).map(normalizeTag).filter(Boolean))];
  await db.put('exercises', ex);
  return ex;
}

export async function deleteExercise(id) {
  // rimuove esercizio + relativo storico pesi
  const logs = await db.getByIndex('weightLog', 'exerciseId', id);
  for (const l of logs) await db.del('weightLog', l.id);
  await db.del('exercises', id);
}

export async function allTags() {
  const exs = await listExercises();
  const set = new Set();
  exs.forEach((e) => (e.tags || []).forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b, 'it'));
}

/* ---------------- STORICO PESI (weightLog) ---------------- */

export async function getWeightHistory(exerciseId) {
  const logs = await db.getByIndex('weightLog', 'exerciseId', exerciseId);
  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLatestWeight(exerciseId) {
  const hist = await getWeightHistory(exerciseId);
  return hist.length ? hist[hist.length - 1] : null;
}

/**
 * Progresso rispetto alla registrazione numerica precedente.
 * Ritorna { delta, latest, previous } oppure null se non calcolabile
 * (meno di due valori numerici). delta = ultimo - penultimo.
 */
export async function getWeightProgress(exerciseId) {
  const hist = (await getWeightHistory(exerciseId)).filter((h) => h.value != null);
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1];
  const previous = hist[hist.length - 2];
  return { delta: Math.round((latest.value - previous.value) * 100) / 100, latest, previous };
}

/**
 * Registra un peso per un esercizio. Se esiste già una voce nella stessa data
 * per lo stesso esercizio, la aggiorna (evita duplicati nello stesso giorno).
 */
export async function logWeight(exerciseId, { value, note = '', date = todayISO(), workoutId = null } = {}) {
  const hist = await getWeightHistory(exerciseId);
  const sameDay = hist.find((h) => h.date === date);
  const numeric = value === '' || value === null || value === undefined ? null : Number(value);
  if (sameDay) {
    sameDay.value = Number.isNaN(numeric) ? null : numeric;
    sameDay.note = note;
    sameDay.workoutId = workoutId;
    await db.put('weightLog', sameDay);
    return sameDay;
  }
  const entry = {
    id: uid(),
    exerciseId,
    date,
    value: Number.isNaN(numeric) ? null : numeric,
    note,
    workoutId,
  };
  await db.put('weightLog', entry);
  return entry;
}

export async function deleteWeightLog(id) {
  await db.del('weightLog', id);
}

/* ---------------- EXPORT / IMPORT ---------------- */

export async function exportData() {
  const [workouts, exercises, weightLog] = await Promise.all([
    db.getAll('workouts'),
    db.getAll('exercises'),
    db.getAll('weightLog'),
  ]);
  return {
    app: 'GymBro',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { workouts, exercises, weightLog },
  };
}

export async function importData(json, { replace = true } = {}) {
  if (!json || !json.data) throw new Error('File di backup non valido');
  const { workouts = [], exercises = [], weightLog = [] } = json.data;
  if (replace) {
    await db.clearStore('workouts');
    await db.clearStore('exercises');
    await db.clearStore('weightLog');
  }
  await db.putMany('exercises', exercises);
  await db.putMany('weightLog', weightLog);
  await db.putMany('workouts', workouts);
  return { workouts: workouts.length, exercises: exercises.length, weightLog: weightLog.length };
}

/* ---------------- META (stato app) ---------------- */

export async function getMeta(key, fallback = null) {
  const m = await db.get('meta', key);
  return m ? m.value : fallback;
}

export async function setMeta(key, value) {
  await db.put('meta', { key, value });
}

/* ---------------- Tracciamento backup ---------------- */

export async function markBackupDone() {
  await setMeta('lastBackup', new Date().toISOString());
}

export async function getLastBackup() {
  return getMeta('lastBackup', null);
}

/**
 * true se conviene ricordare un backup: mai fatto (e ci sono dati) oppure
 * ultimo backup più vecchio di `days` giorni.
 */
export async function shouldRemindBackup(days = 30) {
  const workouts = await db.getAll('workouts');
  const logs = await db.getAll('weightLog');
  if (workouts.length === 0 && logs.length === 0) return false; // niente da salvare
  const last = await getLastBackup();
  if (!last) return true;
  const ageDays = (Date.now() - new Date(last).getTime()) / 86400000;
  return ageDays >= days;
}

export { db };
