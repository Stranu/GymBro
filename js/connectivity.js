/* GymBro - fonte di verità UNICA dello stato di connettività.
 *
 * Combina due segnali in un solo stato booleano `offline`:
 *   offline = (!navigator.onLine) OPPURE (ultima chiamata a una tabella
 *             Supabase fallita, cioè !_supabaseReachable)
 *
 * NESSUN import (né `sync` né `db`): questo modulo è un semplice contenitore
 * di stato e deve restare privo di dipendenze per evitare cicli di import.
 * - Il browser segnala la connettività del dispositivo (eventi online/offline).
 * - `sync.js` è l'unico a segnalare la raggiungibilità Supabase, perché è
 *   l'unico che parla con la rete (markReachable/markUnreachable).
 * - La UI (indicatore header + riga Impostazioni) consuma soltanto via subscribe.
 *
 * Il reconnect-fullSync NON vive qui: il listener `online` fa solo _recompute();
 * è `app.js` (che importa `sync`) a lanciare `sync.fullSync()` sull'evento
 * `online`, chiudendo il cerchio con markReachable()/markUnreachable().
 */

let _offline = (typeof navigator !== 'undefined') ? !navigator.onLine : false;
let _supabaseReachable = true;      // finché non fallisce una chiamata a tabella
let _started = false;               // start() idempotente
const _subs = new Set();

function _recompute() {
  const next = (typeof navigator !== 'undefined' ? !navigator.onLine : false) || !_supabaseReachable;
  if (next === _offline) return;    // emetti SOLO sui cambi effettivi
  _offline = next;
  for (const cb of _subs) {
    try { cb(getState()); } catch (e) { console.error(e); }
  }
}

/** Snapshot sincrono dello stato. */
export function getState() {
  return { offline: _offline };
}

/**
 * Registra un listener invocato ad ogni cambio di stato. Ritorna l'unsubscribe.
 * I listener sono wrappati in try/catch (vedi _recompute) e non lanciano mai.
 */
export function subscribe(cb) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

/** Supabase ha risposto: segnala raggiungibile. */
export function markReachable() {
  _supabaseReachable = true;
  _recompute();
}

/** Una chiamata a una tabella Supabase è fallita: segnala irraggiungibile. */
export function markUnreachable() {
  _supabaseReachable = false;
  _recompute();
}

/**
 * Registra i listener window online/offline e fa un _recompute() iniziale.
 * Idempotente: chiamate ripetute non ri-registrano i listener.
 */
export function start() {
  if (_started) return;
  _started = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => { _recompute(); });
    // Sul reconnect qui ci limitiamo a _recompute(): il fullSync che conferma
    // la raggiungibilità Supabase è lanciato da app.js.
    window.addEventListener('online', () => { _recompute(); });
  }
  _recompute();
}
