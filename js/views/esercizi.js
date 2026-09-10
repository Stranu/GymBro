/* GymBro - view: catalogo esercizi + dettaglio esercizio con storico/grafico */
import * as store from '../store.js';
import * as router from '../router.js';
import { el, clear, emptyState, openModal, confirmDialog, promptDialog, toast, tagChip, fmtDate } from '../ui.js';
import { lineChart } from '../chart.js';

/* ============ LISTA CATALOGO ============ */
export async function renderEsercizi(mount) {
  window.setViewTitle('Catalogo esercizi');
  const [exercises, tags] = await Promise.all([store.listExercises(), store.allTags()]);
  clear(mount);

  if (exercises.length === 0) {
    mount.appendChild(emptyState('🏋️', 'Il catalogo è vuoto. Gli esercizi che aggiungi alle schede compaiono qui.'));
    return;
  }

  const state = { q: '', tag: null };
  const search = el('input', { class: 'input', placeholder: 'Cerca esercizio…', oninput: (e) => { state.q = e.target.value.toLowerCase(); renderList(); } });
  mount.appendChild(el('div', { class: 'field' }, [search]));

  const tagBar = el('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;' });
  const renderTagBar = () => {
    clear(tagBar);
    tagBar.appendChild(el('button', { class: 'tag tag-selectable' + (state.tag == null ? ' active' : ''), text: 'Tutti', onClick: () => { state.tag = null; renderTagBar(); renderList(); } }));
    tags.forEach((t) => tagBar.appendChild(el('button', { class: 'tag tag-selectable' + (state.tag === t ? ' active' : ''), text: '#' + t, onClick: () => { state.tag = state.tag === t ? null : t; renderTagBar(); renderList(); } })));
  };
  if (tags.length) mount.appendChild(tagBar);

  const listWrap = el('div', {});
  mount.appendChild(listWrap);

  async function renderList() {
    let filtered = exercises;
    if (state.tag) filtered = filtered.filter((e) => (e.tags || []).includes(state.tag));
    if (state.q) filtered = filtered.filter((e) => e.name.toLowerCase().includes(state.q));
    clear(listWrap);
    if (state.tag) {
      listWrap.appendChild(el('p', { class: 'muted small', text: `${filtered.length} esercizi con #${state.tag}` }));
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

  renderTagBar();
  renderList();
}

/* ============ DETTAGLIO ESERCIZIO ============ */
export async function renderEsercizio(mount, params) {
  const id = params[0];
  const ex = await store.getExercise(id);
  if (!ex) { clear(mount); mount.appendChild(emptyState('❓', 'Esercizio non trovato.')); return; }
  window.setViewTitle(ex.name);

  const history = await store.getWeightHistory(id);
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
        const t = await promptDialog('Nuovo tag', { label: 'Tag (es. gambe)', placeholder: 'gambe' });
        if (t) { ex.tags = [...new Set([...(ex.tags || []), store.normalizeTag(t)])]; await store.updateExercise(ex); renderTags(); }
      },
    }));
  };

  mount.appendChild(el('div', { class: 'card' }, [
    el('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start;' }, [
      el('p', { class: 'card-title', style: 'flex:1;', text: ex.name }),
      el('button', { class: 'icon-btn', 'aria-label': 'Rinomina', onClick: async () => {
        const name = await promptDialog('Rinomina esercizio', { label: 'Nome', value: ex.name });
        if (name) { ex.name = name; await store.updateExercise(ex); router.handleRoute(); }
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
  mount.appendChild(el('button', { class: 'btn btn-primary btn-block', style: 'margin:6px 0 12px;', onClick: () => addWeight(ex) }, '+ Registra peso'));

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
            if (ok) { await store.deleteWeightLog(h.id); toast('Eliminata'); router.handleRoute(); }
          } }, '🗑️'),
        ]),
      ]));
    });
    mount.appendChild(card);
  }

  // Elimina esercizio
  mount.appendChild(el('div', { class: 'divider' }));
  mount.appendChild(el('button', { class: 'btn btn-ghost btn-block', style: 'color:var(--danger);', onClick: async () => {
    const ok = await confirmDialog('Eliminare l\'esercizio?', `"${ex.name}" e tutto il suo storico verranno eliminati. Resterà eventualmente referenziato nelle schede come esercizio mancante.`, { okLabel: 'Elimina', danger: true });
    if (ok) { await store.deleteExercise(ex.id); toast('Esercizio eliminato'); router.navigate('esercizi'); }
  } }, '🗑️  Elimina esercizio'));

  mount.appendChild(el('div', { style: 'height:40px;' }));

  async function addWeight(ex) {
    const latest = history.length ? history[history.length - 1] : null;
    const valIn = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.5', placeholder: 'es. 50', value: latest && latest.value != null ? latest.value : '' });
    const noteIn = el('input', { class: 'input', placeholder: 'es. per lato', value: latest ? (latest.note || '') : '' });
    const dateIn = el('input', { class: 'input', type: 'date', value: store.todayISO() });
    openModal('Registra peso · ' + ex.name, el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'Peso (kg)' }), valIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Nota' }), noteIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Data' }), dateIn]),
    ]), [
      { label: 'Annulla', class: 'btn-ghost', onClick: (c) => c() },
      { label: 'Salva', class: 'btn-primary', onClick: async (c) => {
        await store.logWeight(ex.id, { value: valIn.value, note: noteIn.value.trim(), date: dateIn.value || store.todayISO() });
        c(); toast('Peso salvato'); router.handleRoute();
      } },
    ]);
  }
}
