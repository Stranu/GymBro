/* GymBro - view: grafici per esercizio e per tag (scheda corrente + universale) */
import * as store from '../store.js';
import { el, clear, emptyState, tagFilter } from '../ui.js';
import { lineChart, PALETTE } from '../chart.js';

export async function renderGrafici(mount) {
  window.setViewTitle('Grafici');
  clear(mount);

  const [workouts, exercises, tags] = await Promise.all([
    store.listWorkouts(), store.listExercises(), store.allTags(),
  ]);

  if (exercises.length === 0) {
    mount.appendChild(emptyState('📈', 'Nessun dato ancora. Aggiungi esercizi e registra i pesi per vedere i grafici.'));
    return;
  }

  // storico completo per exerciseId (una volta sola)
  const histMap = {};
  for (const ex of exercises) histMap[ex.id] = await store.getWeightHistory(ex.id);

  // Selettore modalità: scheda corrente vs universale
  const state = { mode: 'universale', workoutId: null, selected: [] };
  const activeWorkouts = workouts.filter((w) => !w.archived);
  if (activeWorkouts.length) { state.workoutId = activeWorkouts[0].id; }

  const controls = el('div', {});
  mount.appendChild(controls);
  const body = el('div', {});
  mount.appendChild(body);

  function renderControls() {
    clear(controls);
    // toggle modalità
    const toggle = el('div', { style: 'display:flex; gap:8px; margin-bottom:12px;' }, [
      el('button', { class: 'btn btn-sm ' + (state.mode === 'scheda' ? 'btn-primary' : 'btn-ghost'), style: 'flex:1;', onClick: () => { state.mode = 'scheda'; state.selected.length = 0; renderControls(); renderBody(); } }, 'Scheda corrente'),
      el('button', { class: 'btn btn-sm ' + (state.mode === 'universale' ? 'btn-primary' : 'btn-ghost'), style: 'flex:1;', onClick: () => { state.mode = 'universale'; state.selected.length = 0; renderControls(); renderBody(); } }, 'Andamento generale'),
    ]);
    controls.appendChild(toggle);

    if (state.mode === 'scheda') {
      if (!activeWorkouts.length) {
        controls.appendChild(el('p', { class: 'muted small', text: 'Nessuna scheda attiva.' }));
      } else {
        const sel = el('select', { class: 'input', onChange: (e) => { state.workoutId = e.target.value; state.selected.length = 0; renderBody(); } },
          activeWorkouts.map((w) => el('option', { value: w.id, ...(w.id === state.workoutId ? { selected: 'selected' } : {}) }, w.name)));
        controls.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Scheda' }), sel]));
      }
    }
  }

  function drawExerciseCharts(exList, container) {
    // un grafico per tag: linee affiancate degli esercizi con quel tag
    const tagSet = new Set();
    exList.forEach((ex) => (ex.tags || []).forEach((t) => tagSet.add(t)));
    let tagList = [...tagSet].sort((a, b) => a.localeCompare(b, 'it'));
    // se sono selezionati dei tag, mostra solo i grafici di quei tag
    if (state.selected.length) tagList = tagList.filter((t) => state.selected.includes(t));

    // esercizi senza tag: mostrati singolarmente solo se nessun filtro attivo
    if (!state.selected.length) {
      const untagged = exList.filter((ex) => !(ex.tags || []).length && (histMap[ex.id] || []).some((h) => h.value != null));
      if (untagged.length) {
        container.appendChild(el('div', { class: 'section-head' }, [el('h2', { text: 'Senza tag' })]));
        untagged.forEach((ex) => container.appendChild(singleChart(ex)));
      }
    }

    if (tagList.length === 0) return;

    tagList.forEach((tag) => {
      const inTag = exList.filter((ex) => (ex.tags || []).includes(tag));
      const series = inTag.map((ex, i) => ({
        label: ex.name,
        color: PALETTE[i % PALETTE.length],
        points: (histMap[ex.id] || []).filter((h) => h.value != null).map((h) => ({ x: h.date, y: h.value })),
      })).filter((s) => s.points.length > 0);

      const wrap = el('div', { class: 'chart-wrap' }, [
        el('h3', { text: '#' + tag + '  ·  ' + inTag.length + ' esercizi' }),
      ]);
      if (series.length === 0) {
        wrap.appendChild(el('p', { class: 'muted small', text: 'Nessun peso registrato per questi esercizi.' }));
      } else {
        const canvas = el('canvas', { height: '220' });
        wrap.appendChild(canvas);
        wrap.appendChild(legend(series));
        requestAnimationFrame(() => lineChart(canvas, series));
      }
      container.appendChild(wrap);
    });
  }

  function singleChart(ex) {
    const series = [{ label: ex.name, color: '#38bdf8', points: (histMap[ex.id] || []).filter((h) => h.value != null).map((h) => ({ x: h.date, y: h.value })) }];
    const wrap = el('div', { class: 'chart-wrap' }, [el('h3', { text: ex.name })]);
    const canvas = el('canvas', { height: '200' });
    wrap.appendChild(canvas);
    requestAnimationFrame(() => lineChart(canvas, series));
    return wrap;
  }

  function legend(series) {
    return el('div', { class: 'legend' }, series.map((s) => el('div', { class: 'legend-item' }, [
      el('span', { class: 'legend-swatch', style: 'background:' + s.color }),
      el('span', { text: s.label }),
    ])));
  }

  function renderBody() {
    clear(body);
    if (state.mode === 'universale') {
      body.appendChild(el('p', { class: 'muted small', text: 'Tutto lo storico, tra tutte le schede.' }));
      if (tags.length) body.appendChild(tagFilter(tags, state.selected, renderBody, {
        label: 'Mostra gruppi',
        hint: 'Seleziona i gruppi muscolari da mostrare. Se non selezioni nulla vedi tutti i grafici.',
      }));
      drawExerciseCharts(exercises, body);
    } else {
      const w = workouts.find((x) => x.id === state.workoutId);
      if (!w) { body.appendChild(el('p', { class: 'muted', text: 'Seleziona una scheda.' })); return; }
      // esercizi presenti nella scheda
      const ids = new Set();
      (w.days || []).forEach((d) => (d.items || []).forEach((it) => {
        if (it.type === 'superset') (it.exercises || []).forEach((s) => ids.add(s.exerciseId));
        else if (it.exerciseId) ids.add(it.exerciseId);
      }));
      const exList = exercises.filter((ex) => ids.has(ex.id));
      if (exList.length === 0) { body.appendChild(el('p', { class: 'muted', text: 'Nessun esercizio in questa scheda.' })); return; }

      // conteggio esercizi per tag in questa scheda
      const counts = {};
      exList.forEach((ex) => (ex.tags || []).forEach((t) => counts[t] = (counts[t] || 0) + 1));
      const countTags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      if (countTags.length) {
        const card = el('div', { class: 'card' }, [el('p', { class: 'card-sub', style: 'margin-bottom:8px;', text: 'Esercizi per gruppo in questa scheda:' })]);
        const chips = el('div', {}, countTags.map((t) => el('span', { class: 'badge', style: 'margin:2px 4px 2px 0;', text: `#${t}: ${counts[t]}` })));
        card.appendChild(chips);
        body.appendChild(card);
      }

      if (countTags.length) body.appendChild(tagFilter(countTags, state.selected, renderBody, {
        label: 'Mostra gruppi',
        hint: 'Seleziona i gruppi muscolari da mostrare. Se non selezioni nulla vedi tutti i grafici.',
      }));
      drawExerciseCharts(exList, body);
    }
  }

  renderControls();
  renderBody();
}
