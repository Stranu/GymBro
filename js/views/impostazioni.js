/* GymBro - view: impostazioni / backup / info */
import * as store from '../store.js';
import * as router from '../router.js';
import { el, clear, toast, confirmDialog } from '../ui.js';

export async function renderImpostazioni(mount) {
  window.setViewTitle('Altro');
  clear(mount);

  // --- Backup ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Backup dati' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('p', { class: 'muted small', text: 'I dati sono salvati solo su questo dispositivo. Esporta un backup ogni tanto per non perderli.' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary btn-block', onClick: exportBackup }, '⬇️  Esporta backup (.json)'),
    el('div', { class: 'spacer' }),
    el('label', { class: 'btn btn-ghost btn-block', style: 'cursor:pointer;' }, [
      '⬆️  Importa backup',
      el('input', {
        type: 'file', accept: 'application/json,.json',
        style: 'display:none;',
        onChange: importBackup,
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

  // --- Dati / reset ---
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Zona pericolosa' })]));
  mount.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn btn-danger btn-block', onClick: resetAll }, '🗑️  Cancella tutti i dati'),
  ]));

  mount.appendChild(el('p', { class: 'muted small', style: 'text-align:center; margin-top:24px;', text: 'GymBro · progetto personale · dati locali' }));
}

async function exportBackup() {
  const data = await store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', {
    href: url,
    download: `gymbro-backup-${store.todayISO()}.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup esportato');
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

async function resetAll() {
  const ok = await confirmDialog('Cancellare tutto?',
    'Tutte le schede, gli esercizi e lo storico verranno eliminati definitivamente.',
    { okLabel: 'Cancella tutto', danger: true });
  if (!ok) return;
  await store.db.clearAll();
  toast('Dati cancellati');
  router.navigate('schede');
}
