/* GymBro - client Supabase + helper auth sottili.
 *
 * Il client arriva da esm.sh come modulo ES (niente npm/bundler nel progetto).
 * URL e publishable key sono valori PUBLIC: è corretto committarli anche in una
 * repo pubblica. La sicurezza NON dipende dal nasconderli, dipende da RLS
 * (ogni utente legge/scrive solo le righe con user_id = auth.uid()).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = 'https://dzxnmexvregajijjseqt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E77K0UCQ5FPkGwChJE541A_5KO3ii8U';

// Manteniamo la persistenza di sessione di default di supabase-js
// (localStorage): così la sessione sopravvive ai reload senza config extra.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------- Helper auth (wrapper sottili) ----------------
 * Ognuno inoltra a supabase.auth.* e restituisce il { data, error } di
 * supabase, così il chiamante (la UI) decide come gestire gli errori.
 */

/** Registrazione con email+password. */
export function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

/** Login con email+password. */
export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Logout. */
export function signOut() {
  return supabase.auth.signOut();
}

/**
 * Invia l'email di recupero password. Supabase manda un link che riporta
 * all'app (redirectTo): cliccandolo l'utente torna autenticato in sessione di
 * "recovery" e può impostare una nuova password (vedi updatePassword).
 * Ritorna il { data, error } di supabase.
 * @param {string} email
 * @param {string} [redirectTo]  URL a cui tornare dopo il click sul link
 */
export function resetPassword(email, redirectTo = window.location.origin + window.location.pathname) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

/** Imposta una nuova password per l'utente nella sessione corrente (recovery). */
export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

/** Sessione corrente (o null se non loggato). */
export async function getSession() {
  return (await supabase.auth.getSession()).data.session;
}

/** Utente corrente (o null se non loggato). */
export async function getUser() {
  return (await supabase.auth.getUser()).data.user;
}

/** Sottoscrive i cambi di stato auth (login/logout/refresh token). */
export function onAuthStateChange(cb) {
  return supabase.auth.onAuthStateChange(cb);
}
