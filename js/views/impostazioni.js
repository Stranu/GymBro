/* GymBro - view: impostazioni / backup / info */
import * as store from '../store.js';
import * as router from '../router.js';
import * as sync from '../sync.js';
import { el, clear, toast, confirmDialog, fmtDate, downloadJSON, tryOr } from '../ui.js';
import { getSession, getUser, signOut, onAuthStateChange } from '../supabase.js';
import { openAuthModal } from './auth.js';

export async function renderImpostazioni(mount) {
  window.setViewTitle('Altro');
  clear(mount);

  // --- Backup ---
  const lastBackup = await store.getLastBackup();
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Backup dati' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('p', { class: 'muted small', text: 'I dati sono salvati solo su questo dispositivo. Esporta un backup ogni tanto per non perderli.' }),
    el('p', { class: 'small', style: 'margin:6px 0 0;' + (lastBackup ? '' : 'color:var(--accent);'), text: lastBackup ? 'Ultimo backup: ' + fmtDate(lastBackup) : 'Non hai ancora fatto un backup.' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary btn-block', onClick: exportBackup }, '⬇️  Esporta backup (.json)'),
    el('div', { class: 'spacer' }),
    el('label', { class: 'btn btn-ghost btn-block', style: 'cursor:pointer;' }, [
      '⬆️  Importa backup completo',
      el('input', {
        type: 'file', accept: 'application/json,.json',
        style: 'display:none;',
        onChange: importBackup,
      }),
    ]),
  ]));

  // --- Import singola scheda ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Schede singole' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('p', { class: 'muted small', text: 'Importa una scheda ricevuta da qualcuno (o esportata da te). Viene aggiunta senza cancellare le tue: gli esercizi con lo stesso nome vengono uniti. Per esportare una singola scheda usa il menu ⋮ sulla scheda.' }),
    el('div', { class: 'spacer' }),
    el('label', { class: 'btn btn-ghost btn-block', style: 'cursor:pointer;' }, [
      '⬆️  Importa una scheda',
      el('input', {
        type: 'file', accept: 'application/json,.json',
        style: 'display:none;',
        onChange: importSingleWorkout,
      }),
    ]),
  ]));

  // --- Installazione ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'App' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('p', { class: 'muted small', text: 'Installa GymBro sulla schermata Home per usarlo come app, anche offline.' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-ghost btn-block', onClick: () => window.triggerInstall && window.triggerInstall() }, '📲  Aggiungi a schermata Home'),
  ]));

  // --- Account e sincronizzazione ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Account e sincronizzazione' })]));
  const accountCard = el('div', { class: 'card' });
  mount.appendChild(accountCard);
  await setupAccountSection(accountCard);

  // --- Dati / reset ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Zona pericolosa' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn btn-danger btn-block', onClick: resetAll }, '🗑️  Cancella tutti i dati'),
  ]));

  mount.appendChild(el('p', { class: 'muted small', style: 'text-align:center; margin-top:24px;', text: 'GymBro · progetto personale · dati locali' }));
}

/**
 * Popola la card "Account e sincronizzazione" e la mantiene aggiornata.
 * Si sottoscrive a sync.onStatus e onAuthStateChange per ri-renderizzare SOLO
 * questa card (le altre sezioni restano intatte). Le sottoscrizioni si
 * disiscrivono da sole quando la card non è più nel DOM (cambio vista).
 */
async function setupAccountSection(card) {
  const render = async () => {
    if (!card.isConnected) return;
    clear(card);
    const session = await getSession();
    if (!card.isConnected) return;
    if (session) {
      await renderAccountLoggedIn(card);
    } else {
      renderAccountLoggedOut(card);
    }
  };

  // Sottoscrizioni con auto-cleanup quando la card lascia il DOM.
  let unsubStatus = null;
  let authSub = null;
  const cleanup = () => {
    if (unsubStatus) { unsubStatus(); unsubStatus = null; }
    if (authSub) { authSub.unsubscribe(); authSub = null; }
  };
  const onUpdate = () => {
    if (!card.isConnected) { cleanup(); return; }
    render();
  };

  unsubStatus = sync.onStatus(onUpdate);
  const authRes = onAuthStateChange(() => onUpdate());
  authSub = authRes && authRes.data ? authRes.data.subscription : null;

  await render();
}

/** Stato NON loggato: spiegazione + pulsante Accedi / Registrati. */
function renderAccountLoggedOut(card) {
  card.appendChild(el('p', { class: 'muted small', text: 'I dati restano salvati su questo dispositivo. Accedi per salvarli anche sul cloud (backup automatico) e usarli su più dispositivi. L\'app funziona comunque senza account e offline.' }));
  card.appendChild(el('div', { class: 'spacer' }));
  card.appendChild(el('button', {
    class: 'btn btn-primary btn-block',
    onClick: () => openAuthModal(),
  }, '🔐  Accedi / Registrati'));
}

/** Stato loggato: email, stato sync, "Sincronizza ora" ed "Esci". */
async function renderAccountLoggedIn(card) {
  const user = await getUser();
  if (!card.isConnected) return;
  const email = (user && user.email) || 'Account';
  const status = sync.getStatus();

  card.appendChild(el('p', { class: 'small', text: 'Connesso come ' + email }));

  const statusText = status.syncing
    ? 'Sincronizzazione…'
    : (status.lastSync
        ? 'Ultima sincronizzazione: ' + new Date(status.lastSync).toLocaleString('it-IT')
        : 'Non ancora sincronizzato.');
  card.appendChild(el('p', { class: 'muted small', style: 'margin:6px 0 0;', text: statusText }));

  card.appendChild(el('div', { class: 'spacer' }));
  card.appendChild(el('button', {
    class: 'btn btn-primary btn-block',
    disabled: status.syncing ? '' : null,
    onClick: () => sync.fullSync(),
  }, '🔄  Sincronizza ora'));

  card.appendChild(el('div', { class: 'spacer' }));
  card.appendChild(el('button', {
    class: 'btn btn-ghost btn-block',
    onClick: async () => {
      await signOut();
      toast('Disconnesso');
    },
  }, '🚪  Esci'));
}

async function exportBackup() {
  const ok = await tryOr(async () => {
    const data = await store.exportData();
    downloadJSON(`gymbro-backup-${store.todayISO()}.json`, data);
    await store.markBackupDone();
  }, 'Esportazione non riuscita');
  if (ok) toast('Backup esportato');
}

async function importBackup(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const ok = await confirmDialog('Importare il backup?',
    'I dati attuali verranno sostituiti da quelli del file. Consigliato esportare prima un backup.',
    { okLabel: 'Importa', danger: true });
  if (!ok) { e.target.value = ''; return; }
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await store.importData(json, { replace: true });
    toast(`Importati: ${res.workouts} schede, ${res.exercises} esercizi`);
    router.navigate('schede');
  } catch (err) {
    console.error(err);
    toast('File non valido');
  }
  e.target.value = '';
}

async function importSingleWorkout(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (json.kind !== 'workout') {
      toast('Questo file è un backup completo: usa "Importa backup completo".');
      e.target.value = '';
      return;
    }
    const res = await store.importWorkout(json);
    toast(`Scheda "${res.name}" importata`);
    router.navigate('schede');
  } catch (err) {
    console.error(err);
    toast('File non valido');
  }
  e.target.value = '';
}

async function resetAll() {
  const ok = await confirmDialog('Cancellare tutto?',
    'Tutte le schede, gli esercizi e lo storico verranno eliminati definitivamente.',
    { okLabel: 'Cancella tutto', danger: true });
  if (!ok) return;
  await store.db.clearAll();
  toast('Dati cancellati');
  router.navigate('schede');
}
