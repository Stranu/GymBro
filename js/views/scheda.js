/* GymBro - view: dettaglio/editor di una scheda */
import * as store from '../store.js';
import * as router from '../router.js';
import {
  el, clear, openModal, confirmDialog, promptDialog, toast, emptyState, tagChip, progressBadge, fmtDate,
} from '../ui.js';
import { openExercisePicker } from './picker.js';
import { createToolbar, teardownTools, startTimerWith } from './tools.js';

// cache dei pesi più recenti, dei nomi e del progresso per exerciseId (evita query ripetute e flicker durante il render)
let latestCache = {};
let nameCache = {};
let progressCache = {};

/**
 * Ridisegna la scheda mantenendo la posizione di scroll corrente.
 * Il router resetta lo scroll in cima a ogni render (utile tra pagine diverse),
 * ma qui vogliamo restare dove siamo quando si aggiungono/modificano esercizi.
 */
async function rerender() {
  const y = window.scrollY;
  await router.handleRoute();
  // ripristina dopo che il DOM è stato ricostruito
  window.scrollTo(0, y);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/** Estrae i secondi di recupero da un testo libero tipo "2-3 min", "90s", "1:30". */
function parseRestSeconds(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  // formato m:ss
  const clock = t.match(/(\d+):(\d{1,2})/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  // range tipo "2-3 min" -> prende il valore più alto
  const nums = t.match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return null;
  const val = Math.max(...nums.map((n) => parseFloat(n.replace(',', '.'))));
  if (t.includes('min')) return Math.round(val * 60);
  return Math.round(val); // presume secondi
}

export async function renderScheda(mount, params) {
  const id = params[0];
  const w = await store.getWorkout(id);
  if (!w) {
    clear(mount);
    mount.appendChild(emptyState('❓', 'Scheda non trovata.'));
    return;
  }
  window.setViewTitle(w.name);

  // precarica pesi recenti per tutti gli esercizi della scheda
  await preloadLatest(w);

  clear(mount);

  // Intestazione scheda: nota + default
  mount.appendChild(headerCard(w));

  // Giorni
  (w.days || []).forEach((day) => mount.appendChild(dayCard(w, day)));

  // Azione: aggiungi giorno
  mount.appendChild(el('button', {
    class: 'btn btn-ghost btn-block', style: 'margin-top:6px;',
    onClick: () => addDay(w),
  }, '+ Aggiungi giorno'));

  // spazio per non far coprire l'ultimo contenuto dalla barra strumenti fissa (compatta)
  mount.appendChild(el('div', { style: 'height:80px;' }));

  // Barra strumenti fissa: contatore serie + timer di recupero
  const defRest = parseRestSeconds((w.defaults || {}).rest) || 90;
  mount.appendChild(createToolbar({ defaultRestSeconds: defRest }));

  // Quando si lascia la scheda, ferma il timer
  registerTeardown();
}

// Ferma il timer quando si naviga via dalla scheda (una sola volta)
let teardownHooked = false;
function registerTeardown() {
  if (teardownHooked) return;
  teardownHooked = true;
  router.onRouteChange((route) => {
    if (route.name !== 'scheda') teardownTools();
  });
}

async function preloadLatest(w) {
  latestCache = {};
  nameCache = {};
  progressCache = {};
  const ids = new Set();
  (w.days || []).forEach((d) => (d.items || []).forEach((it) => {
    if (it.type === 'superset') (it.exercises || []).forEach((s) => ids.add(s.exerciseId));
    else if (it.exerciseId) ids.add(it.exerciseId);
  }));
  for (const exId of ids) {
    latestCache[exId] = await store.getLatestWeight(exId);
    progressCache[exId] = await store.getWeightProgress(exId);
    const ex = await store.getExercise(exId);
    nameCache[exId] = ex ? ex.name : '(esercizio)';
  }
}

function exName(exId) {
  return nameCache[exId] || '(esercizio)';
}

/* ---------------- Header scheda ---------------- */
function headerCard(w) {
  const d = w.defaults || {};
  const defLine = `Default: ${d.sets || '?'}×${d.reps || '?'} · rec ${d.rest || '-'}`;
  return el('div', { class: 'card' }, [
    el('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start; gap:10px;' }, [
      el('div', { style: 'flex:1; min-width:0;' }, [
        w.note
          ? el('p', { class: 'small', style: 'white-space:pre-wrap; margin:0 0 8px;', text: w.note })
          : el('p', { class: 'muted small', style: 'margin:0 0 8px;', text: 'Nessuna nota. Tocca per aggiungerne una.' }),
        el('span', { class: 'badge', text: defLine }),
      ]),
      el('button', { class: 'icon-btn', 'aria-label': 'Modifica scheda', onClick: () => editWorkoutMeta(w) }, '✏️'),
    ]),
  ]);
}

function editWorkoutMeta(w) {
  const d = w.defaults || {};
  const noteInput = el('textarea', { class: 'textarea', placeholder: 'Es. 3 serie da max 10 ripetizioni. 2/3 min recupero.' });
  noteInput.value = w.note || '';
  const setsIn = el('input', { class: 'input', value: d.sets || '', placeholder: '3' });
  const repsIn = el('input', { class: 'input', value: d.reps || '', placeholder: '10' });
  const restIn = el('input', { class: 'input', value: d.rest || '', placeholder: '2-3 min' });

  openModal('Impostazioni scheda', el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Nota generale' }), noteInput]),
    el('p', { class: 'muted small', text: 'Valori di default (usati quando un esercizio non ha valori propri):' }),
    el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Serie' }), setsIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Ripetizioni' }), repsIn]),
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'Recupero' }), restIn]),
  ]), [
    { label: 'Annulla', class: 'btn-ghost', onClick: (c) => c() },
    {
      label: 'Salva', class: 'btn-primary', onClick: async (c) => {
        w.note = noteInput.value.trim();
        w.defaults = { sets: setsIn.value.trim(), reps: repsIn.value.trim(), rest: restIn.value.trim() };
        await store.saveWorkout(w);
        c();
        toast('Salvato');
        rerender();
      },
    },
  ]);
}

/* ---------------- Giorno ---------------- */
function dayCard(w, day) {
  const items = day.items || [];
  const head = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;' }, [
    el('h3', { style: 'margin:0; font-size:1.1rem;', text: day.name }),
    el('button', { class: 'icon-btn', 'aria-label': 'Opzioni giorno', onClick: () => dayMenu(w, day) }, '⋮'),
  ]);

  let body;
  if (items.length) {
    body = el('div', { class: 'item-list' }, items.map((it) => {
      const node = renderItem(w, day, it);
      node.dataset.itemId = it.id;
      return node;
    }));
    enableReorder(body, w, day);
  } else {
    body = el('p', { class: 'muted small', text: 'Nessun esercizio. Aggiungine uno qui sotto.' });
  }

  const actions = el('div', { class: 'list-actions' }, [
    el('button', { class: 'btn btn-sm btn-primary', onClick: () => addExercise(w, day) }, '+ Esercizio'),
    el('button', { class: 'btn btn-sm btn-ghost', onClick: () => addSuperset(w, day) }, '+ Super serie'),
  ]);

  return el('div', { class: 'card' }, [head, body, actions]);
}

function dayMenu(w, day) {
  const body = el('div', {}, [
    mBtn('✏️  Rinomina giorno', async () => {
      const name = await promptDialog('Rinomina giorno', { label: 'Nome', value: day.name });
      if (name) { day.name = name; await store.saveWorkout(w); rerender(); }
    }),
    mBtn('🗑️  Elimina giorno', async () => {
      const ok = await confirmDialog('Eliminare il giorno?', `"${day.name}" e i suoi esercizi verranno rimossi dalla scheda.`, { okLabel: 'Elimina', danger: true });
      if (ok) {
        w.days = w.days.filter((d) => d.id !== day.id);
        await store.saveWorkout(w);
        toast('Giorno eliminato');
        rerender();
      }
    }, true),
  ]);
  openModal(day.name, body);
}

/* ---------------- Item (esercizio singolo o superset) ---------------- */
function renderItem(w, day, item) {
  if (item.type === 'superset') return renderSuperset(w, day, item);
  return renderSingle(w, day, item);
}

function paramLine(w, params) {
  const d = w.defaults || {};
  const sets = params.sets || d.sets || '';
  const reps = params.reps || d.reps || '';
  const rest = params.rest || d.rest || '';
  const bits = [];
  if (sets || reps) bits.push(`${sets || '?'}×${reps || '?'}`);
  if (rest) bits.push('rec ' + rest);
  return bits.join(' · ');
}

function renderSingle(w, day, item) {
  const name = exName(item.exerciseId);
  const meta = paramLine(w, item);
  const latest = latestCache[item.exerciseId];
  const wLabel = latest && latest.value != null
    ? `${latest.value} kg`
    : (latest && latest.note ? latest.note : '—');

  return el('div', { class: 'ex-row' + (item.pushNext ? ' push-next' : '') }, [
    dragHandle(),
    el('div', { class: 'ex-main', onClick: () => openExerciseSheet(w, day, item) }, [
      el('div', { class: 'ex-name' }, [
        item.pushNext ? el('span', { class: 'push-next-mark', title: 'Prossima volta prova a caricare di più', text: '🔼 ' }) : null,
        el('span', { text: name }),
      ].filter(Boolean)),
      el('div', { class: 'ex-meta' }, [
        meta ? el('span', { text: meta }) : null,
        (item.note ? el('span', { text: (meta ? ' · ' : '') + item.note }) : null),
      ].filter(Boolean)),
    ]),
    el('div', { class: 'ex-weight-col', onClick: () => quickWeight(w, item.exerciseId), title: 'Aggiorna peso' }, [
      el('div', { class: 'ex-weight' }, wLabel),
      progressCache[item.exerciseId] ? progressBadge(progressCache[item.exerciseId].delta) : null,
    ].filter(Boolean)),
  ]);
}

function dragHandle() {
  return el('div', { class: 'drag-handle', 'aria-label': 'Trascina per riordinare', title: 'Trascina per riordinare' }, '⠿');
}

/**
 * Toggle "prossima volta prova a caricare di più".
 * Mutato in-memory sull'item; viene persistito dal Salva del foglio.
 * @param {object} target  item singolo o sub-esercizio di una superset
 */
function pushNextToggle(target) {
  const box = el('input', { type: 'checkbox' });
  box.checked = !!target.pushNext;
  box.addEventListener('change', () => { target.pushNext = box.checked; });
  return el('label', { class: 'pushnext-toggle' }, [
    box,
    el('span', {}, '🔼  Prossima volta prova a caricare di più'),
  ]);
}

function renderSuperset(w, day, item) {
  const rows = (item.exercises || []).map((sub) => {
    const latest = latestCache[sub.exerciseId];
    const wLabel = latest && latest.value != null ? `${latest.value} kg` : (latest && latest.note ? latest.note : '—');
    return el('div', { class: 'ex-row' + (sub.pushNext ? ' push-next' : '') }, [
      el('div', { class: 'ex-main', onClick: () => openSupersetSubSheet(w, day, item, sub) }, [
        el('div', { class: 'ex-name' }, [
          sub.pushNext ? el('span', { class: 'push-next-mark', title: 'Prossima volta prova a caricare di più', text: '🔼 ' }) : null,
          el('span', { text: exName(sub.exerciseId) }),
        ].filter(Boolean)),
        el('div', { class: 'ex-meta', text: [sub.reps ? sub.reps + ' rip' : '', sub.note || ''].filter(Boolean).join(' · ') }),
      ]),
      el('div', { class: 'ex-weight-col', onClick: () => quickWeight(w, sub.exerciseId), title: 'Aggiorna peso' }, [
        el('div', { class: 'ex-weight' }, wLabel),
        progressCache[sub.exerciseId] ? progressBadge(progressCache[sub.exerciseId].delta) : null,
      ].filter(Boolean)),
    ]);
  });

  const meta = paramLine(w, item);
  return el('div', { class: 'superset' }, [
    el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
      el('div', { style: 'display:flex; align-items:center; gap:6px;' }, [
        dragHandle(),
        el('div', { class: 'superset-label', style: 'margin-bottom:0;', text: 'Super serie' + (meta ? ' · ' + meta : '') }),
      ]),
      el('button', { class: 'icon-btn', style: 'width:32px;height:32px;font-size:1.2rem;', onClick: () => supersetMenu(w, day, item) }, '⋮'),
    ]),
    ...rows,
  ]);
}

/* ---------------- Riordino per trascinamento (Pointer Events, touch-friendly) ---------------- */
function enableReorder(listEl, w, day) {
  let dragging = null;
  let placeholder = null;
  let startY = 0;
  let offsetY = 0;

  listEl.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      const row = handle.closest('[data-item-id]');
      if (!row) return;
      e.preventDefault();
      dragging = row;
      const rect = row.getBoundingClientRect();
      offsetY = e.clientY - rect.top;
      startY = e.clientY;

      placeholder = el('div', { class: 'drag-placeholder' });
      placeholder.style.height = rect.height + 'px';
      row.parentNode.insertBefore(placeholder, row.nextSibling);

      row.classList.add('dragging');
      row.style.width = rect.width + 'px';
      row.style.position = 'fixed';
      row.style.left = rect.left + 'px';
      row.style.top = rect.top + 'px';
      row.style.zIndex = '1000';
      row.style.pointerEvents = 'none';

      handle.setPointerCapture(e.pointerId);
      if (navigator.vibrate) navigator.vibrate(15);

      const onMove = (ev) => {
        if (!dragging) return;
        const y = ev.clientY;
        dragging.style.top = (y - offsetY) + 'px';
        // trova la riga sopra cui siamo
        const siblings = [...listEl.querySelectorAll('[data-item-id]')].filter((n) => n !== dragging);
        let placed = false;
        for (const sib of siblings) {
          const r = sib.getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            listEl.insertBefore(placeholder, sib);
            placed = true;
            break;
          }
        }
        if (!placed) listEl.appendChild(placeholder);
      };

      const onUp = async () => {
        handle.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!dragging) return;
        // posiziona la riga al posto del placeholder
        listEl.insertBefore(dragging, placeholder);
        placeholder.remove();
        dragging.classList.remove('dragging');
        dragging.removeAttribute('style');
        // ricava il nuovo ordine dagli elementi DOM
        const order = [...listEl.querySelectorAll('[data-item-id]')].map((n) => n.dataset.itemId);
        day.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        dragging = null;
        placeholder = null;
        await store.saveWorkout(w);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

/* ---------------- Aggiunta esercizi ---------------- */
async function addExercise(w, day) {
  const picked = await openExercisePicker({ title: 'Aggiungi esercizio' });
  if (!picked) return;
  const ex = await store.getOrCreateExercise(picked.name, picked.tags);
  day.items = day.items || [];
  day.items.push({ id: store.uid(), type: 'single', exerciseId: ex.id, sets: '', reps: '', rest: '', note: '' });
  await store.saveWorkout(w);
  latestCache[ex.id] = await store.getLatestWeight(ex.id);
  toast('Esercizio aggiunto');
  rerender();
}

async function addSuperset(w, day) {
  // scegli 2+ esercizi in sequenza
  const first = await openExercisePicker({ title: 'Super serie · 1° esercizio' });
  if (!first) return;
  const second = await openExercisePicker({ title: 'Super serie · 2° esercizio' });
  if (!second) return;
  const e1 = await store.getOrCreateExercise(first.name, first.tags);
  const e2 = await store.getOrCreateExercise(second.name, second.tags);
  day.items = day.items || [];
  day.items.push({
    id: store.uid(), type: 'superset', sets: '', rest: '', note: '',
    exercises: [
      { exerciseId: e1.id, reps: '', note: '' },
      { exerciseId: e2.id, reps: '', note: '' },
    ],
  });
  await store.saveWorkout(w);
  latestCache[e1.id] = await store.getLatestWeight(e1.id);
  latestCache[e2.id] = await store.getLatestWeight(e2.id);
  toast('Super serie aggiunta');
  rerender();
}

async function addDay(w) {
  const n = (w.days || []).length + 1;
  const name = await promptDialog('Nuovo giorno', { label: 'Nome', value: 'G' + n, okLabel: 'Aggiungi' });
  if (name === null) return;
  w.days = w.days || [];
  w.days.push({ id: store.uid(), name: name || 'G' + n, items: [] });
  await store.saveWorkout(w);
  rerender();
}

/* ---------------- Sheet dettaglio esercizio singolo ---------------- */
async function openExerciseSheet(w, day, item) {
  const ex = await store.getExercise(item.exerciseId);
  if (!ex) return;
  const d = w.defaults || {};

  const nameIn = el('input', { class: 'input', value: ex.name, placeholder: 'Nome esercizio' });
  const setsIn = el('input', { class: 'input', value: item.sets || '', placeholder: d.sets || '3' });
  const repsIn = el('input', { class: 'input', value: item.reps || '', placeholder: d.reps || '10' });
  const restIn = el('input', { class: 'input', value: item.rest || '', placeholder: d.rest || '2-3 min' });
  const noteIn = el('input', { class: 'input', value: item.note || '', placeholder: 'Note (opzionale)' });

  const tagsWrap = el('div', {});
  const renderTags = () => {
    clear(tagsWrap);
    (ex.tags || []).forEach((t) => tagsWrap.appendChild(tagChip(t, {
      onRemove: async (tag) => { ex.tags = ex.tags.filter((x) => x !== tag); await store.updateExercise(ex); renderTags(); },
    })));
    tagsWrap.appendChild(el('button', {
      class: 'tag tag-selectable', text: '+ tag',
      onClick: async () => {
        const t = await promptDialog('Nuovo tag', { label: 'Tag (es. gambe, deltoidi)', placeholder: 'gambe' });
        if (t) { ex.tags = [...new Set([...(ex.tags || []), store.normalizeTag(t)])]; await store.updateExercise(ex); renderTags(); }
      },
    }));
  };
  renderTags();

  openModal(ex.name, el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Nome esercizio' }), nameIn]),
    el('p', { class: 'muted small', text: 'Serie/ripetizioni/recupero: lascia vuoto per usare i default della scheda.' }),
    el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Serie' }), setsIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Ripetizioni' }), repsIn]),
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'Recupero' }), restIn]),
    el('div', { class: 'field' }, [el('label', { text: 'Note' }), noteIn]),
    el('div', { class: 'field' }, [el('label', { text: 'Tag muscolari' }), tagsWrap]),
    pushNextToggle(item),
    el('div', { class: 'divider' }),
    el('button', { class: 'btn btn-ghost btn-block', style: 'margin-bottom:8px;', onClick: () => {
      const secs = parseRestSeconds(item.rest || (w.defaults || {}).rest) || 90;
      startTimerWith(secs);
      document.querySelector('.modal-backdrop')?.remove();
      toast('Timer recupero avviato');
    } }, '⏱️  Avvia timer recupero'),
    el('button', { class: 'btn btn-ghost btn-block', onClick: () => router.navigate('esercizio/' + ex.id) }, '📈  Vedi storico e grafico'),
  ]), [
    {
      label: 'Rimuovi', class: 'btn-ghost', onClick: async (c) => {
        c();
        const ok = await confirmDialog('Rimuovere dall\'allenamento?', `"${ex.name}" verrà tolto da questo giorno. Lo storico resta nel catalogo.`, { okLabel: 'Rimuovi', danger: true });
        if (ok) {
          day.items = day.items.filter((x) => x.id !== item.id);
          await store.saveWorkout(w);
          rerender();
        }
      },
    },
    {
      label: 'Salva', class: 'btn-primary', onClick: async (c) => {
        // Rinomina esercizio nel catalogo globale (si aggiorna ovunque).
        const newName = nameIn.value.trim();
        if (newName && newName !== ex.name) {
          const dup = await store.findExerciseByName(newName);
          if (dup && dup.id !== ex.id) {
            toast('Esiste già un esercizio con questo nome');
            return;
          }
          ex.name = newName;
          await store.updateExercise(ex);
        }
        item.sets = setsIn.value.trim();
        item.reps = repsIn.value.trim();
        item.rest = restIn.value.trim();
        item.note = noteIn.value.trim();
        await store.saveWorkout(w);
        c();
        toast('Salvato');
        rerender();
      },
    },
  ]);
}

/* ---------------- Sheet di un esercizio dentro una super serie ---------------- */
async function openSupersetSubSheet(w, day, item, sub) {
  const ex = await store.getExercise(sub.exerciseId);
  if (!ex) return;
  const repsIn = el('input', { class: 'input', value: sub.reps || '', placeholder: (w.defaults || {}).reps || '10' });
  const noteIn = el('input', { class: 'input', value: sub.note || '', placeholder: 'Note (opzionale)' });

  openModal(ex.name + ' · super serie', el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Ripetizioni' }), repsIn]),
    el('div', { class: 'field' }, [el('label', { text: 'Note' }), noteIn]),
    pushNextToggle(sub),
    el('div', { class: 'divider' }),
    el('button', { class: 'btn btn-ghost btn-block', onClick: () => router.navigate('esercizio/' + ex.id) }, '📈  Vedi storico e grafico'),
  ]), [
    { label: 'Annulla', class: 'btn-ghost', onClick: (c) => c() },
    {
      label: 'Salva', class: 'btn-primary', onClick: async (c) => {
        sub.reps = repsIn.value.trim();
        sub.note = noteIn.value.trim();
        await store.saveWorkout(w);
        c();
        toast('Salvato');
        rerender();
      },
    },
  ]);
}

function supersetMenu(w, day, item) {
  const setsIn = el('input', { class: 'input', value: item.sets || '', placeholder: (w.defaults || {}).sets || '3' });
  const restIn = el('input', { class: 'input', value: item.rest || '', placeholder: (w.defaults || {}).rest || '2-3 min' });
  openModal('Super serie', el('div', {}, [
    el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Serie' }), setsIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Recupero' }), restIn]),
    ]),
    el('p', { class: 'muted small', text: 'Il peso di ogni esercizio si aggiorna toccando il valore nella riga.' }),
  ]), [
    {
      label: 'Rimuovi', class: 'btn-ghost', onClick: async (c) => {
        c();
        const ok = await confirmDialog('Rimuovere la super serie?', 'Verrà tolta da questo giorno.', { okLabel: 'Rimuovi', danger: true });
        if (ok) { day.items = day.items.filter((x) => x.id !== item.id); await store.saveWorkout(w); rerender(); }
      },
    },
    {
      label: 'Salva', class: 'btn-primary', onClick: async (c) => {
        item.sets = setsIn.value.trim(); item.rest = restIn.value.trim();
        await store.saveWorkout(w); c(); rerender();
      },
    },
  ]);
}

/* ---------------- Aggiornamento peso rapido ---------------- */
async function quickWeight(w, exerciseId) {
  const ex = await store.getExercise(exerciseId);
  const latest = await store.getLatestWeight(exerciseId);
  const progress = await store.getWeightProgress(exerciseId);
  const valIn = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.5', value: latest && latest.value != null ? latest.value : '', placeholder: 'es. 50' });
  const noteIn = el('input', { class: 'input', value: latest ? (latest.note || '') : '', placeholder: 'es. per lato, elastico...' });
  const dateIn = el('input', { class: 'input', type: 'date', value: store.todayISO() });

  openModal('Peso · ' + (ex ? ex.name : ''), el('div', {}, [
    el('div', { class: 'field' }, [el('label', { text: 'Peso (kg)' }), valIn]),
    el('div', { class: 'field' }, [el('label', { text: 'Nota' }), noteIn]),
    el('div', { class: 'field' }, [el('label', { text: 'Data' }), dateIn]),
    latest ? el('p', { class: 'muted small', style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' }, [
      el('span', { text: `Ultimo: ${latest.value != null ? latest.value + ' kg' : (latest.note || '-')} (${fmtDate(latest.date)})` }),
      progress ? progressBadge(progress.delta) : null,
    ].filter(Boolean)) : null,
  ].filter(Boolean)), [
    { label: 'Annulla', class: 'btn-ghost', onClick: (c) => c() },
    {
      label: 'Salva peso', class: 'btn-primary', onClick: async (c) => {
        await store.logWeight(exerciseId, {
          value: valIn.value,
          note: noteIn.value.trim(),
          date: dateIn.value || store.todayISO(),
          workoutId: w.id,
        });
        latestCache[exerciseId] = await store.getLatestWeight(exerciseId);
        c();
        toast('Peso aggiornato');
        rerender();
      },
    },
  ]);
}

function mBtn(label, onClick, danger = false) {
  return el('button', {
    class: 'btn btn-block btn-ghost',
    style: 'justify-content:flex-start; margin-bottom:8px;' + (danger ? 'color:var(--danger);' : ''),
    onClick: () => { document.querySelector('.modal-backdrop')?.remove(); onClick(); },
  }, label);
}
