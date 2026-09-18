/* GymBro - view: catalogo esercizi + dettaglio esercizio con storico/grafico */
import * as store from '../store.js';
import * as router from '../router.js';
import { el, clear, emptyState, confirmDialog, promptDialog, toast, tagChip, fmtDate, tagFilter, tagPickerDialog, tryOr } from '../ui.js';
import { lineChart } from '../chart.js';
import { openWeightDialog } from './weight-dialog.js';

/* ============ LISTA CATALOGO ============ */
export async function renderEsercizi(mount) {
  window.setViewTitle('Catalogo esercizi');
  const [exercises, tags] = await Promise.all([store.listExercises(), store.allTags()]);
  clear(mount);

  if (exercises.length === 0) {
    mount.appendChild(emptyState('🏋️', 'Catalogo vuoto', null, 'Gli esercizi che aggiungi alle schede compaiono qui, con il loro storico pesi.'));
    return;
  }

  const state = { q: '', selected: [] };
  const search = el('input', { class: 'input', placeholder: 'Cerca esercizio…', oninput: (e) => { state.q = e.target.value.toLowerCase(); renderList(); } });
  mount.appendChild(el('div', { class: 'field' }, [search]));

  if (tags.length) mount.appendChild(tagFilter(tags, state.selected, renderList, {
    hint: 'Selezionando più tag vedi solo gli esercizi che li hanno tutti.',
  }));

  const listWrap = el('div', {});
  mount.appendChild(listWrap);

  async function renderList() {
    let filtered = exercises;
    // multi-tag AND: deve avere TUTTI i tag selezionati
    if (state.selected.length) filtered = filtered.filter((e) => state.selected.every((t) => (e.tags || []).includes(t)));
    if (state.q) filtered = filtered.filter((e) => e.name.toLowerCase().includes(state.q));
    clear(listWrap);
    if (state.selected.length) {
      listWrap.appendChild(el('p', { class: 'muted small', text: `${filtered.length} esercizi con ${state.selected.map((t) => '#' + t).join(' + ')}` }));
    }
    if (filtered.length === 0) {
      listWrap.appendChild(el('p', { class: 'muted', style: 'text-align:center; padding:20px;', text: 'Nessun risultato.' }));
      return;
    }
    for (const ex of filtered) {
      const latest = await store.getLatestWeight(ex.id);
      const sub = [
        (ex.tags || []).map((t) => '#' + t).join(' '),
        latest && latest.value != null ? `${latest.value} kg` : (latest && latest.note ? latest.note : ''),
      ].filter(Boolean).join(' · ');
      listWrap.appendChild(el('div', { class: 'card card-tap', onClick: () => router.navigate('esercizio/' + ex.id) }, [
        el('p', { class: 'card-title', text: ex.name }),
        sub ? el('p', { class: 'card-sub', text: sub }) : null,
      ].filter(Boolean)));
    }
  }

  renderList();
}

/* ============ DETTAGLIO ESERCIZIO ============ */
export async function renderEsercizio(mount, params) {
  const id = params[0];
  const ex = await store.getExercise(id);
  if (!ex) { clear(mount); mount.appendChild(emptyState('❓', 'Esercizio non trovato.')); return; }
  window.setViewTitle(ex.name);

  const history = await store.getWeightHistory(id);
  const knownTags = await store.allTags();
  clear(mount);

  // Header con nome + tag
  const tagsWrap = el('div', { style: 'margin-top:8px;' });
  const renderTags = () => {
    clear(tagsWrap);
    (ex.tags || []).forEach((t) => tagsWrap.appendChild(tagChip(t, {
      onRemove: async (tag) => { ex.tags = ex.tags.filter((x) => x !== tag); await store.updateExercise(ex); renderTags(); },
    })));
    tagsWrap.appendChild(el('button', {
      class: 'tag tag-selectable', text: '+ tag',
      onClick: async () => {
        const t = await tagPickerDialog(knownTags, ex.tags || [], store.normalizeTag);
        if (t) {
          ex.tags = [...new Set([...(ex.tags || []), t])];
          if (await tryOr(() => store.updateExercise(ex), 'Salvataggio non riuscito')) {
            if (!knownTags.includes(t)) knownTags.push(t);
            renderTags();
          }
        }
      },
    }));
  };

  mount.appendChild(el('div', { class: 'card' }, [
    el('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start;' }, [
      el('p', { class: 'card-title', style: 'flex:1;', text: ex.name }),
      el('button', { class: 'icon-btn', 'aria-label': 'Rinomina', onClick: async () => {
        const name = await promptDialog('Rinomina esercizio', { label: 'Nome', value: ex.name });
        if (name) { ex.name = name; if (await tryOr(() => store.updateExercise(ex), 'Salvataggio non riuscito')) router.handleRoute(); }
      } }, '✏️'),
    ]),
    tagsWrap,
  ]));
  renderTags();

  // Grafico andamento peso
  const numeric = history.filter((h) => h.value != null);
  if (numeric.length >= 1) {
    const chartWrap = el('div', { class: 'chart-wrap' }, [el('h3', { text: 'Andamento peso (kg)' })]);
    const canvas = el('canvas', { height: '200' });
    chartWrap.appendChild(canvas);
    mount.appendChild(chartWrap);
    // disegna dopo il layout per avere la larghezza corretta
    requestAnimationFrame(() => {
      lineChart(canvas, [{
        label: ex.name,
        color: '#38bdf8',
        points: numeric.map((h) => ({ x: h.date, y: h.value })),
      }]);
    });
  } else {
    mount.appendChild(el('p', { class: 'muted small', style: 'text-align:center; padding:10px;', text: 'Registra almeno un peso per vedere il grafico.' }));
  }

  // Pulsante nuovo peso
  mount.appendChild(el('button', { class: 'btn btn-primary btn-block', style: 'margin:6px 0 12px;', onClick: () => openWeightDialog(ex.id, { onSaved: () => router.handleRoute() }) }, '+ Registra peso'));

  // Storico
  mount.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Storico' })]));
  if (history.length === 0) {
    mount.appendChild(el('p', { class: 'muted small', text: 'Nessuna registrazione ancora.' }));
  } else {
    const card = el('div', { class: 'card' });
    [...history].reverse().forEach((h) => {
      card.appendChild(el('div', { class: 'history-item' }, [
        el('div', {}, [
          el('div', { text: (h.value != null ? h.value + ' kg' : (h.note || '—')) }),
          h.note && h.value != null ? el('div', { class: 'muted small', text: h.note }) : null,
        ].filter(Boolean)),
        el('div', { style: 'display:flex; align-items:center; gap:10px;' }, [
          el('span', { class: 'muted small', text: fmtDate(h.date) }),
          el('button', { class: 'icon-btn', style: 'width:32px;height:32px;font-size:1rem;', 'aria-label': 'Elimina', onClick: async () => {
            const ok = await confirmDialog('Eliminare la registrazione?', `${h.value != null ? h.value + ' kg' : h.note} del ${fmtDate(h.date)}`, { okLabel: 'Elimina', danger: true });
            if (ok && await tryOr(() => store.deleteWeightLog(h.id), 'Eliminazione non riuscita')) { toast('Eliminata'); router.handleRoute(); }
          } }, '🗑️'),
        ]),
      ]));
    });
    mount.appendChild(card);
  }

  // Elimina esercizio
  mount.appendChild(el('div', { class: 'divider' }));
  mount.appendChild(el('button', { class: 'btn btn-ghost btn-block', style: 'color:var(--danger);', onClick: async () => {
    const usage = await store.countExerciseUsage(ex.id);
    const msg = usage > 0
      ? `"${ex.name}" e tutto il suo storico verranno eliminati. Verrà anche rimosso da ${usage} ${usage === 1 ? 'scheda' : 'schede'} in cui è presente.`
      : `"${ex.name}" e tutto il suo storico verranno eliminati.`;
    const ok = await confirmDialog('Eliminare l\'esercizio?', msg, { okLabel: 'Elimina', danger: true });
    if (ok && await tryOr(() => store.deleteExercise(ex.id), 'Eliminazione non riuscita')) { toast('Esercizio eliminato'); router.navigate('esercizi'); }
  } }, '🗑️  Elimina esercizio'));

  mount.appendChild(el('div', { style: 'height:40px;' }));
}
