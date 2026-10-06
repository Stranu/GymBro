/* GymBro - IndexedDB low-level wrapper */

const DB_NAME = 'gymbro';
const DB_VERSION = 2;

/**
 * Object stores:
 *  - workouts:  schede { id, name, note, defaults{sets,reps,rest}, days[], archived, createdAt, updatedAt }
 *  - exercises: catalogo globale { id, name, nameLower, tags[], createdAt }
 *  - weightLog: storico pesi { id, exerciseId, date(ISO), value(number|null), note, workoutId }
 *  - meta:      chiave/valore per stato app { key, value }
 *  - tombstones: cancellazioni per la sync { tid, store, id, deletedAt }
 */

let _dbPromise = null;

/** Store che partecipano alla sincronizzazione remota (meta/tombstones esclusi). */
const SYNCED = new Set(['workouts', 'exercises', 'weightLog']);

let _onChange = null;

/**
 * Registra un singolo callback invocato dopo ogni scrittura su uno store
 * sincronizzato. È un hook di registrazione: db.js NON importa sync.js (evita
 * cicli di import). Il callback riceve il nome dello store modificato.
 */
export function onChange(cb) {
  _onChange = cb;
}

function emitChange(store) {
  if (_onChange && SYNCED.has(store)) {
    try {
      _onChange(store);
    } catch (e) {
      console.error(e);
    }
  }
}

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
      if (!db.objectStoreNames.contains('tombstones')) {
        db.createObjectStore('tombstones', { keyPath: 'tid' });
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
  emitChange(store);
  return value;
}

export async function putMany(store, values) {
  const db = await openDB();
  const t = tx(db, store, 'readwrite');
  const os = t.objectStore(store);
  values.forEach((v) => os.put(v));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => { emitChange(store); resolve(values); };
    t.onerror = () => reject(t.error);
  });
}

export async function del(store, key) {
  const db = await openDB();
  if (SYNCED.has(store)) {
    // cancellazione utente: elimina il record e registra la tombstone nella
    // stessa transazione, così la sync può propagare la cancellazione.
    const t = tx(db, [store, 'tombstones'], 'readwrite');
    t.objectStore(store).delete(key);
    t.objectStore('tombstones').put({
      tid: store + ':' + key,
      store,
      id: key,
      deletedAt: new Date().toISOString(),
    });
    await new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transazione annullata'));
    });
  } else {
    const t = tx(db, store, 'readwrite');
    await reqToPromise(t.objectStore(store).delete(key));
  }
  emitChange(store);
}

/**
 * Cancellazione LOCALE senza tombstone e senza emitChange: usata dal percorso
 * di pull (sync) per applicare una cancellazione proveniente dal remoto senza
 * rimandarla indietro nel push (niente loop).
 */
export async function delLocal(store, key) {
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

/**
 * Esegue operazioni su più store in UNA SOLA transazione (atomica).
 * Se qualcosa fallisce, IndexedDB annulla l'intera transazione: nessuno stato
 * parziale. `fn` riceve un oggetto { <storeName>: objectStore } su cui operare
 * in modo sincrono (put/delete/clear); NON usare await dentro fn tra due
 * operazioni sullo stesso tx, altrimenti la transazione si chiude.
 * @param {string[]} stores
 * @param {'readonly'|'readwrite'} mode
 * @param {function} fn  (stores) => void
 */
export async function runTx(storeNames, mode, fn) {
  const db = await openDB();
  const t = db.transaction(storeNames, mode);
  const stores = {};
  storeNames.forEach((n) => { stores[n] = t.objectStore(n); });
  return new Promise((resolve, reject) => {
    let result;
    try {
      result = fn(stores);
    } catch (e) {
      try { t.abort(); } catch (_) { /* già in errore */ }
      reject(e);
      return;
    }
    t.oncomplete = () => {
      storeNames.forEach((n) => { if (SYNCED.has(n)) emitChange(n); });
      resolve(result);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transazione annullata'));
  });
}

/**
 * Sostituisce atomicamente il contenuto di uno o più store: svuota e riscrive
 * tutto in una singola transazione. Se fallisce, i dati esistenti restano
 * intatti (rollback automatico).
 * @param {Object.<string, Array>} dataByStore  es. { exercises: [...], workouts: [...] }
 */
export async function replaceStores(dataByStore) {
  const names = Object.keys(dataByStore);
  return runTx(names, 'readwrite', (stores) => {
    for (const name of names) {
      stores[name].clear();
      for (const value of dataByStore[name]) stores[name].put(value);
    }
  });
}
