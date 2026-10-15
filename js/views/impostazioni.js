/* GymBro - view: impostazioni / backup / info */
import * as store from '../store.js';
import * as router from '../router.js';
import * as sync from '../sync.js';
import { el, clear, toast, confirmDialog, fmtDate, downloadJSON, tryOr } from '../ui.js';
import { getSession, getUser, signOut, onAuthStateChange } from '../supabase.js';
import { openAuthModal } from './auth.js';

// Gli altri servizi gratuiti dello stesso autore (NON include GymBro stesso).
// Icone referenziate via URL assoluti su GitHub Pages così si caricano a
// prescindere dall'host su cui gira questa pagina.
const OTHER_SERVICES = [
  { name: 'IndiSpesabile', url: 'https://stranu.github.io/IndiSpesabile',
    icon: 'https://stranu.github.io/IndiSpesabile/icons/icon-192.png' },
  { name: 'DeDDMTool', url: 'https://stranu.github.io/DeDDMTool',
    icon: 'https://stranu.github.io/DeDDMTool/icons/icon-192.png' },
];

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

  // --- Prova gli altri servizi ---
  const helpP = el('p', {
    id: 'otherServicesHelp', class: 'muted small', hidden: true,
    style: 'margin:0 0 12px;',
    text: 'Altri strumenti gratuiti che ho realizzato. GymBro e IndiSpesabile condividono lo stesso account; DeDDMTool è uno strumento per le sessioni di D&D.',
  });
  const helpBtn = el('button', {
    class: 'icon-btn help-toggle', 'aria-label': 'Mostra descrizione',
    'aria-expanded': 'false', 'aria-controls': 'otherServicesHelp',
    onClick: () => {
      const open = helpP.hasAttribute('hidden'); // ora nascosto -> sta per aprirsi
      helpP.toggleAttribute('hidden', !open);
      helpBtn.setAttribute('aria-expanded', String(open));
    },
  }, '?');
  mount.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Prova gli altri servizi' }),
    helpBtn,
  ]));
  mount.appendChild(el('div', { class: 'card' }, [
    helpP,
    ...OTHER_SERVICES.map((s) => el('a', {
      class: 'service-row',
      href: s.url, target: '_blank', rel: 'noopener noreferrer',
    }, [
      el('img', { class: 'service-icon', src: s.icon, alt: '', width: '40', height: '40', loading: 'lazy' }),
      el('span', { class: 'service-name', text: s.name }),
    ])),
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
  // Guardia anti-doppione: render() è asincrona (ha un await su getSession /
  // getUser tra clear(card) e l'append dei nodi). Se due trigger la lanciano
  // "a cavallo" — tipicamente l'await render() iniziale e l'evento
  // INITIAL_SESSION che onAuthStateChange emette subito dopo la subscribe —
  // entrambe le passate fanno clear() e poi, al ritorno dall'await, appendono
  // i propri nodi: la card finisce popolata DUE volte. Serializziamo con un
  // token di generazione: ogni render incrementa `gen`, e dopo ogni await una
  // passata ormai "stale" (gen diverso) si ferma senza toccare il DOM. Così
  // vince sempre e solo l'ultima render, che popola la card UNA volta.
  let gen = 0;
  // render(sessionOverride): se la sessione è già nota (es. arriva dall'evento
  // onAuthStateChange(event, session)) la usiamo direttamente ed evitiamo la
  // ri-lettura con getSession(). Questo elimina una race di supabase-js in cui,
  // subito dopo SIGNED_IN, getSession() può ancora restituire lo stato vecchio:
  // era la causa per cui dopo il login la card non si aggiornava finché non si
  // chiudeva e riapriva l'app. `undefined` = "non noto, rileggi"; `null` =
  // "nessuna sessione" (logout esplicito).
  const render = async (sessionOverride = undefined) => {
    if (!card.isConnected) return;
    const myGen = ++gen;
    const session = sessionOverride !== undefined ? sessionOverride : await getSession();
    if (myGen !== gen || !card.isConnected) return; // superata da una render più recente
    clear(card);
    if (session) {
      await renderAccountLoggedIn(card, () => myGen === gen && card.isConnected);
    } else {
      renderAccountLoggedOut(card, render);
    }
  };

  // Sottoscrizioni con auto-cleanup quando la card lascia il DOM.
  let unsubStatus = null;
  let authSub = null;
  const cleanup = () => {
    if (unsubStatus) { unsubStatus(); unsubStatus = null; }
    if (authSub) { authSub.unsubscribe(); authSub = null; }
  };
  const onUpdate = (sessionOverride) => {
    if (!card.isConnected) { cleanup(); return; }
    render(sessionOverride);
  };

  unsubStatus = sync.onStatus(() => onUpdate());
  // onAuthStateChange fornisce (event, session): passiamo la session direttamente
  // alla render così non dipendiamo da una ri-lettura con getSession() che
  // subito dopo il login potrebbe essere ancora disallineata.
  const authRes = onAuthStateChange((_event, session) => onUpdate(session || null));
  authSub = authRes && authRes.data ? authRes.data.subscription : null;

  await render();
}

/**
 * Stato NON loggato: spiegazione + pulsante Accedi / Registrati.
 * @param {HTMLElement} card
 * @param {() => void} rerender  callback per ridisegnare la card dopo il login
 *   (rete di sicurezza indipendente dall'evento onAuthStateChange).
 */
function renderAccountLoggedOut(card, rerender) {
  card.appendChild(el('p', { class: 'muted small', text: 'I dati restano salvati su questo dispositivo. Accedi per salvarli anche sul cloud (backup automatico) e usarli su più dispositivi. L\'app funziona comunque senza account e offline.' }));
  card.appendChild(el('div', { class: 'spacer' }));
  card.appendChild(el('button', {
    class: 'btn btn-primary btn-block',
    onClick: () => openAuthModal({ onDone: () => rerender && rerender() }),
  }, '🔐  Accedi / Registrati'));
}

/**
 * Stato loggato: email, stato sync, "Sincronizza ora" ed "Esci".
 * @param {HTMLElement} card
 * @param {() => boolean} isCurrent  true se questa render è ancora quella
 *   corrente (non superata da una più recente) e la card è nel DOM: viene
 *   ricontrollata dopo l'await su getUser prima di appendere i nodi.
 */
async function renderAccountLoggedIn(card, isCurrent = () => card.isConnected) {
  const user = await getUser();
  if (!isCurrent()) return;
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
