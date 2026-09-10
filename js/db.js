/* GymBro - IndexedDB low-level wrapper */

const DB_NAME = 'gymbro';
const DB_VERSION = 1;

/**
 * Object stores:
 *  - workouts:  schede { id, name, note, defaults{sets,reps,rest}, days[], archived, createdAt, updatedAt }
 *  - exercises: catalogo globale { id, name, nameLower, tags[], createdAt }
 *  - weightLog: storico pesi { id, exerciseId, date(ISO), value(number|null), note, workoutId }
 *  - meta:      chiave/valore per stato app { key, value }
 */

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('workouts')) {
        const s = db.createObjectStore('workouts', { keyPath: 'id' });
        s.createIndex('archived', 'archived', { unique: false });
        s.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('exercises')) {
        const s = db.createObjectStore('exercises', { keyPath: 'id' });
        s.createIndex('nameLower', 'nameLower', { unique: false });
      }
      if (!db.objectStoreNames.contains('weightLog')) {
        const s = db.createObjectStore('weightLog', { keyPath: 'id' });
        s.createIndex('exerciseId', 'exerciseId', { unique: false });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db, stores, mode = 'readonly') {
  const t = db.transaction(stores, mode);
  return t;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return reqToPromise(tx(db, store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return reqToPromise(tx(db, store).objectStore(store).get(key));
}

export async function put(store, value) {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  const r = t.objectStore(store).put(value);
  await reqToPromise(r);
  return value;
}

export async function putMany(store, values) {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  const os = t.objectStore(store);
  values.forEach((v) => os.put(v));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(values);
    t.onerror = () => reject(t.error);
  });
}

export async function del(store, key) {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  await reqToPromise(t.objectStore(store).delete(key));
}

export async function getByIndex(store, indexName, value) {
  const db = await openDB();
  const idx = tx(db, store).objectStore(store).index(indexName);
  return reqToPromise(idx.getAll(value));
}

export async function clearStore(store) {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  await reqToPromise(t.objectStore(store).clear());
}

export async function clearAll() {
  await clearStore('workouts');
  await clearStore('exercises');
  await clearStore('weightLog');
  await clearStore('meta');
}
