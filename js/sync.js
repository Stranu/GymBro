/* GymBro - motore di sincronizzazione (local-first).
 *
 * IndexedDB resta la fonte di verità locale; Supabase è la copia remota.
 * - mapping colonne camelCase (locale) <-> snake_case (remoto) per tabella
 * - cursori push/pull memorizzati nel meta store LOCALE (mai sincronizzato)
 * - soft-delete propagato via tombstones (FEAT-001)
 * - last-write-wins sul campo updated_at
 * - push per-scrittura con debounce, fullSync all'avvio con migrazione iniziale
 *   una tantum per account-su-dispositivo
 * - percorso no-session a ZERO rete: se non c'è sessione tutto esce subito e
 *   non lancia mai eccezioni nella UI.
 *
 * db.js NON importa sync.js: la registrazione avviene qui via db.onChange().
 */

import * as db from './db.js';
import * as store from './store.js';
import { supabase, getSession } from './supabase.js';

/* ---------------- Mapping colonne per tabella ---------------- */
// Chiave = campo locale (camelCase), valore = colonna remota (snake_case).
// I campi non elencati restano identici (1:1).
const FIELD_MAP = {
  workouts: { createdAt: 'created_at', updatedAt: 'updated_at' },
  exercises: { nameLower: 'name_lower', createdAt: 'created_at', updatedAt: 'updated_at' },
  weightLog: { exerciseId: 'exercise_id', workoutId: 'workout_id', updatedAt: 'updated_at' },
};

const REMOTE_TABLE = { workouts: 'workouts', exercises: 'exercises', weightLog: 'weight_log' };
const SYNCED = ['workouts', 'exercises', 'weightLog'];

const EPOCH = '1970-01-01T00:00:00.000Z';

/** Mappa inversa (remoto -> locale) calcolata una volta per store. */
const INVERSE_MAP = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([name, m]) => [
    name,
    Object.fromEntries(Object.entries(m).map(([local, remote]) => [remote, local])),
  ]),
);

/**
 * Riga locale (camelCase) -> riga remota (snake_case) con user_id.
 * Omette i valori undefined. Aggiunge sempre deleted:false sulle righe vive.
 */
function mapToRemote(storeName, row, userId) {
  const map = FIELD_MAP[storeName] || {};
  const out = { user_id: userId };
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const col = map[key] || key;
    out[col] = value;
  }
  return out;
}

/**
 * Riga remota (snake_case) -> riga locale (camelCase).
 * Scarta user_id e deleted (consumati prima: deleted governa la cancellazione).
 */
function mapFromRemote(storeName, row) {
  const inv = INVERSE_MAP[storeName] || {};
  const out = {};
  for (const [col, value] of Object.entries(row)) {
    if (col === 'user_id' || col === 'deleted') continue;
    const key = inv[col] || col;
    out[key] = value;
  }
  return out;
}

/* ---------------- Cursori (meta store LOCALE) ---------------- */

const pushedKey = (s) => `sync.pushedAt.${s}`;
const pulledKey = (s) => `sync.pulledAt.${s}`;

async function getPushed(s) { return store.getMeta(pushedKey(s), EPOCH); }
async function setPushed(s, iso) { return store.setMeta(pushedKey(s), iso); }
async function getPulled(s) { return store.getMeta(pulledKey(s), EPOCH); }
async function setPulled(s, iso) { return store.setMeta(pulledKey(s), iso); }

/* ---------------- Stato + listener per la UI ---------------- */

const state = { lastSync: null, syncing: false };
const statusListeners = new Set();

function emitStatus() {
  for (const cb of statusListeners) {
    try { cb(getStatus()); } catch (e) { console.error(e); }
  }
}

function setSyncing(v) {
  if (state.syncing === v) return;
  state.syncing = v;
  emitStatus();
}

/** Snapshot dello stato di sync per la UI. */
export function getStatus() {
  return { lastSync: state.lastSync, syncing: state.syncing };
}

/** Registra un listener invocato ad ogni cambio di stato (syncing/lastSync). */
export function onStatus(cb) {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

async function loadLastSync() {
  state.lastSync = await store.getMeta('sync.lastSync', null);
}

async function markLastSync() {
  const now = new Date().toISOString();
  state.lastSync = now;
  await store.setMeta('sync.lastSync', now);
  emitStatus();
}

/* ---------------- Push ---------------- */

/**
 * Invia al remoto le righe locali modificate dopo il cursore pushedAt e le
 * cancellazioni (tombstones). Se non c'è sessione esce SUBITO (zero rete).
 * Su errore non avanza i cursori e non consuma le tombstones: il prossimo
 * trigger riprova. Non lancia mai eccezioni verso l'esterno.
 */
export async function push() {
  const session = await getSession();
  if (!session) return; // nessuna rete da loggati-fuori
  const userId = session.user.id;

  for (const name of SYNCED) {
    try {
      const since = await getPushed(name);
      const localRows = await db.getAll(name);
      const changed = localRows.filter((r) => (r.updatedAt || EPOCH) > since);

      // tombstones di questo store -> righe soft-deleted
      const allTombstones = await db.getAll('tombstones');
      const tombstones = allTombstones.filter((t) => t.store === name);
      const deletedRows = tombstones.map((t) => ({
        id: t.id,
        user_id: userId,
        deleted: true,
        updated_at: t.deletedAt,
      }));

      const liveRows = changed.map((r) => mapToRemote(name, r, userId));
      const rows = [...liveRows, ...deletedRows];
      if (rows.length === 0) continue;

      const { error } = await supabase.from(REMOTE_TABLE[name]).upsert(rows);
      if (error) {
        console.error('[sync] push error', name, error);
        continue; // non avanzare cursore, non eliminare tombstones: riprova dopo
      }

      // avanza il cursore al max updatedAt effettivamente inviato
      let maxUpdated = since;
      for (const r of changed) {
        if ((r.updatedAt || EPOCH) > maxUpdated) maxUpdated = r.updatedAt;
      }
      if (maxUpdated !== since) await setPushed(name, maxUpdated);

      // consuma le tombstones inviate con successo
      for (const t of tombstones) await db.delLocal('tombstones', t.tid);
    } catch (e) {
      console.error('[sync] push exception', name, e);
      // continua con gli altri store; non lanciare verso la UI
    }
  }
}

/* ---------------- Pull ---------------- */

/**
 * Scarica dal remoto le righe aggiornate dopo il cursore pulledAt e le applica
 * in locale con last-write-wins. Le righe deleted=true diventano hard-delete
 * locali (via db.delLocal, niente tombstone, niente re-push). Se non c'è
 * sessione esce subito. Non lancia mai verso l'esterno.
 */
export async function pull() {
  const session = await getSession();
  if (!session) return;

  for (const name of SYNCED) {
    try {
      const since = await getPulled(name);
      const { data, error } = await supabase
        .from(REMOTE_TABLE[name])
        .select('*')
        .gt('updated_at', since);
      if (error) {
        console.error('[sync] pull error', name, error);
        continue; // non avanzare il cursore
      }
      if (!data || data.length === 0) continue;

      let maxUpdated = since;
      for (const remote of data) {
        if ((remote.updated_at || EPOCH) > maxUpdated) maxUpdated = remote.updated_at;

        if (remote.deleted === true) {
          // cancellazione remota -> hard-delete locale senza loop
          await db.delLocal(name, remote.id);
          continue;
        }

        const mapped = mapFromRemote(name, remote);
        const local = await db.get(name, remote.id);
        // last-write-wins: scrivi solo se manca in locale o il remoto è più nuovo
        if (!local || (mapped.updatedAt || EPOCH) > (local.updatedAt || EPOCH)) {
          await db.put(name, mapped);
        }
      }

      if (maxUpdated !== since) await setPulled(name, maxUpdated);
    } catch (e) {
      console.error('[sync] pull exception', name, e);
    }
  }
}

/* ---------------- fullSync (avvio + tasto manuale) ---------------- */

let syncing = false; // guard contro chiamate concorrenti

/**
 * Sincronizzazione completa. Se non c'è sessione esce subito (zero rete).
 * Al primo uso per account-su-dispositivo esegue la MIGRAZIONE INIZIALE: carica
 * i dati locali come baseline del server PRIMA del primo pull, così un remoto
 * vuoto non può cancellare i dati locali. Poi pull + push. Aggiorna lastSync.
 */
export async function fullSync() {
  if (syncing) return;
  const session = await getSession();
  if (!session) return;
  const userId = session.user.id;

  syncing = true;
  setSyncing(true);
  try {
    const migratedKey = `sync.migrated.${userId}`;
    const migrated = await store.getMeta(migratedKey, false);

    if (!migrated) {
      await initialMigration(userId);
      await store.setMeta(migratedKey, true);
    }

    await pull();
    await push();
    await markLastSync();
  } catch (e) {
    console.error('[sync] fullSync exception', e);
  } finally {
    syncing = false;
    setSyncing(false);
  }
}

/**
 * Migrazione iniziale (una tantum per account-su-dispositivo): tutti i dati
 * locali diventano la baseline remota. Stampa updatedAt dove manca (persistito
 * localmente) e fa upsert di TUTTO, poi porta ogni cursore pushedAt a "ora".
 */
async function initialMigration(userId) {
  const now = new Date().toISOString();
  for (const name of SYNCED) {
    const rows = await db.getAll(name);
    const stamped = [];
    for (const r of rows) {
      if (!r.updatedAt) {
        r.updatedAt = now;
        await db.put(name, r); // persisti lo stamp in locale
      }
      stamped.push(r);
    }
    if (stamped.length > 0) {
      const remoteRows = stamped.map((r) => mapToRemote(name, r, userId));
      const { error } = await supabase.from(REMOTE_TABLE[name]).upsert(remoteRows);
      if (error) {
        console.error('[sync] initialMigration upsert error', name, error);
        throw error; // interrompi: la migrazione deve riuscire interamente
      }
    }
    await setPushed(name, now);
  }
}

/* ---------------- Debounce + registrazione hook ---------------- */

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Coalizza raffiche di scritture in un solo batch di push.
const debouncedPush = debounce(() => { push(); }, 1500);

/**
 * Registra l'hook db.onChange una volta all'avvio dell'app. push() esce subito
 * se non c'è sessione, quindi da loggati-fuori l'hook è un no-op sicuro.
 */
export function start() {
  loadLastSync();
  db.onChange(() => debouncedPush());
}
