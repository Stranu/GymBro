/* GymBro - view: lista schede */
import * as store from '../store.js';
import * as router from '../router.js';
import { el, clear, emptyState, openModal, confirmDialog, toast, fmtDate } from '../ui.js';

export async function renderSchede(mount) {
  window.setViewTitle('Le mie schede');
  const workouts = await store.listWorkouts();

  const active = workouts.filter((w) => !w.archived);
  const archived = workouts.filter((w) => w.archived);

  clear(mount);

  // Promemoria backup discreto (dismissibile per la sessione)
  if (!backupReminderDismissed && await store.shouldRemindBackup(30)) {
    mount.appendChild(backupBanner());
  }

  if (workouts.length === 0) {
    mount.appendChild(
      emptyState('📋', 'Nessuna scheda ancora. Creane una per iniziare.',
        el('button', { class: 'btn btn-primary', onClick: () => createFlow() }, '+ Nuova scheda'))
    );
    addFab();
    return;
  }

  // Schede attive
  if (active.length) {
    mount.appendChild(sectionHead('Attive'));
    active.forEach((w) => mount.appendChild(workoutCard(w)));
  }

  // Archiviate
  if (archived.length) {
    mount.appendChild(sectionHead('Archivio (' + archived.length + ')'));
    archived.forEach((w) => mount.appendChild(workoutCard(w, true)));
  }

  addFab();

  function addFab() {
    const fab = el('button', { class: 'fab', 'aria-label': 'Nuova scheda', onClick: () => createFlow() }, '+');
    mount.appendChild(fab);
  }
}

function sectionHead(text) {
  return el('div', { class: 'section-head' }, [el('h2', { text })]);
}

// dismiss valido finché l'app resta aperta (non insistente)
let backupReminderDismissed = false;

function backupBanner() {
  const banner = el('div', { class: 'backup-banner' }, [
    el('div', { style: 'flex:1;' }, [
      el('div', { style: 'font-weight:600;', text: '💾 Fai un backup' }),
      el('div', { class: 'small muted', text: 'I dati stanno solo su questo telefono. Salvane una copia per sicurezza.' }),
    ]),
    el('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
      el('button', { class: 'btn btn-sm btn-primary', onClick: () => router.navigate('impostazioni') }, 'Esporta'),
      el('button', { class: 'btn btn-sm btn-ghost', onClick: () => { backupReminderDismissed = true; banner.remove(); } }, 'Più tardi'),
    ]),
  ]);
  return banner;
}

function countExercises(w) {
  let n = 0;
  (w.days || []).forEach((d) => (d.items || []).forEach((it) => {
    n += it.type === 'superset' ? (it.exercises || []).length : 1;
  }));
  return n;
}

function workoutCard(w, isArchived = false) {
  const nDays = (w.days || []).length;
  const nEx = countExercises(w);
  const sub = `${nDays} giorni · ${nEx} esercizi · agg. ${fmtDate(w.updatedAt)}`;

  const card = el('div', { class: 'card card-tap', onClick: () => router.navigate('scheda/' + w.id) }, [
    el('div', { style: 'display:flex; align-items:flex-start; justify-content:space-between; gap:10px;' }, [
      el('div', { style: 'min-width:0; flex:1;' }, [
        el('p', { class: 'card-title', text: w.name }),
        el('p', { class: 'card-sub', text: sub }),
        w.note ? el('p', { class: 'card-sub', style: 'margin-top:6px;', text: w.note }) : null,
      ].filter(Boolean)),
      el('button', {
        class: 'icon-btn',
        'aria-label': 'Opzioni',
        onClick: (e) => { e.stopPropagation(); openWorkoutMenu(w, isArchived); },
      }, '⋮'),
    ]),
  ]);
  return card;
}

function openWorkoutMenu(w, isArchived) {
  const body = el('div', {}, [
    menuBtn('✏️  Rinomina', async (close) => {
      close();
      const { promptDialog } = await import('../ui.js');
      const name = await promptDialog('Rinomina scheda', { label: 'Nome', value: w.name });
      if (name) { w.name = name; await store.saveWorkout(w); toast('Rinominata'); router.handleRoute(); }
    }),
    menuBtn('📑  Duplica', async (close) => {
      close();
      await store.duplicateWorkout(w.id);
      toast('Scheda duplicata');
      router.handleRoute();
    }),
    menuBtn(isArchived ? '📤  Ripristina' : '📥  Archivia', async (close) => {
      close();
      w.archived = !isArchived;
      await store.saveWorkout(w);
      toast(isArchived ? 'Ripristinata' : 'Archiviata');
      router.handleRoute();
    }),
    menuBtn('🗑️  Elimina', async (close) => {
      close();
      const ok = await confirmDialog('Eliminare la scheda?',
        `"${w.name}" verrà eliminata. Lo storico dei pesi degli esercizi resta nel catalogo.`,
        { okLabel: 'Elimina', danger: true });
      if (ok) { await store.deleteWorkout(w.id); toast('Eliminata'); router.handleRoute(); }
    }, true),
  ]);
  openModal(w.name, body);
}

function menuBtn(label, onClick, danger = false) {
  return el('button', {
    class: 'btn btn-block ' + (danger ? 'btn-ghost' : 'btn-ghost'),
    style: 'justify-content:flex-start; margin-bottom:8px;' + (danger ? 'color:var(--danger);' : ''),
    onClick: () => onClick(() => document.querySelector('.modal-backdrop')?.remove()),
  }, label);
}

async function createFlow() {
  const { promptDialog } = await import('../ui.js');
  const suggested = 'Scheda ' + new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const name = await promptDialog('Nuova scheda', {
    label: 'Nome scheda',
    value: suggested.charAt(0).toUpperCase() + suggested.slice(1),
    okLabel: 'Crea',
  });
  if (name === null) return;
  const w = await store.createWorkout({ name: name || 'Nuova scheda' });
  router.navigate('scheda/' + w.id);
}
