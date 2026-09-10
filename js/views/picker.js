/* GymBro - selettore esercizio riutilizzabile (autocomplete + filtro tag + crea nuovo) */
import * as store from '../store.js';
import { el, clear, openModal, fmtDate } from '../ui.js';
import { EXERCISE_LIBRARY } from '../exercise-library.js';

/**
 * Apre il picker. Ritorna Promise<{name, tags[]}|null>.
 * Se l'utente sceglie un esercizio esistente ne restituisce nome+tag (verrà
 * riusato via getOrCreateExercise, quindi nessun doppione). Se ne crea uno
 * nuovo, restituisce il nome digitato e i tag scelti.
 */
export async function openExercisePicker({ title = 'Scegli esercizio' } = {}) {
  const [exercises, userTags] = await Promise.all([store.listExercises(), store.allTags()]);
  // ultimo peso per mostrare un contesto utile ("50 kg · agg. 12/07/2026")
  const latestMap = {};
  for (const ex of exercises) {
    latestMap[ex.id] = await store.getLatestWeight(ex.id);
  }

  // Suggeriti dalla libreria statica, esclusi quelli che hai già nel catalogo.
  const ownNames = new Set(exercises.map((e) => e.name.toLowerCase()));
  const suggestions = EXERCISE_LIBRARY.filter((s) => !ownNames.has(s.name.toLowerCase()));

  // Tag disponibili per il filtro: unione dei tuoi tag + quelli dei suggeriti.
  const tagSet = new Set(userTags);
  suggestions.forEach((s) => (s.tags || []).forEach((t) => tagSet.add(t)));
  const tags = [...tagSet].sort((a, b) => a.localeCompare(b, 'it'));

  return new Promise((resolve) => {
    let activeTag = null;
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const search = el('input', { class: 'input', placeholder: 'Cerca o scrivi un nuovo nome…', autocomplete: 'off' });
    const list = el('div', { class: 'autocomplete-list' });
    const tagBar = el('div', { style: 'display:flex; flex-wrap:wrap; gap:6px; margin:10px 0;' });

    // barra tag per filtrare
    const renderTagBar = () => {
      clear(tagBar);
      if (!tags.length) return;
      tagBar.appendChild(el('button', {
        class: 'tag tag-selectable' + (activeTag == null ? ' active' : ''),
        text: 'Tutti', onClick: () => { activeTag = null; renderTagBar(); renderList(); },
      }));
      tags.forEach((t) => {
        tagBar.appendChild(el('button', {
          class: 'tag tag-selectable' + (activeTag === t ? ' active' : ''),
          text: '#' + t, onClick: () => { activeTag = (activeTag === t ? null : t); renderTagBar(); renderList(); },
        }));
      });
    };

    const sectionHead = (text) => el('div', { class: 'ac-section', text });

    const renderList = () => {
      const q = search.value.trim().toLowerCase();
      clear(list);

      // filtra i TUOI esercizi
      let mine = exercises;
      if (activeTag) mine = mine.filter((e) => (e.tags || []).includes(activeTag));
      if (q) mine = mine.filter((e) => e.name.toLowerCase().includes(q));

      // filtra i SUGGERITI
      let sugg = suggestions;
      if (activeTag) sugg = sugg.filter((s) => (s.tags || []).includes(activeTag));
      if (q) sugg = sugg.filter((s) => s.name.toLowerCase().includes(q));

      // opzione "crea nuovo": solo se c'è testo e nessun match esatto (né tuo né suggerito)
      const exactMine = exercises.some((e) => e.name.toLowerCase() === q);
      const exactSugg = suggestions.some((s) => s.name.toLowerCase() === q);
      if (q && !exactMine && !exactSugg) {
        list.appendChild(el('div', {
          class: 'ac-item', style: 'background:rgba(56,189,248,0.08);',
          onClick: () => { done({ name: search.value.trim(), tags: activeTag ? [activeTag] : [] }); closeModal(); },
        }, [
          el('div', { class: 'ac-name', text: '➕ Crea "' + search.value.trim() + '"' }),
          el('div', { class: 'ac-sub', text: activeTag ? 'con tag #' + activeTag : 'nuovo esercizio' }),
        ]));
      }

      // Sezione: i tuoi esercizi
      if (mine.length) {
        list.appendChild(sectionHead('I tuoi esercizi'));
        mine.slice(0, 60).forEach((ex) => {
          const latest = latestMap[ex.id];
          const sub = [
            (ex.tags || []).length ? (ex.tags.map((t) => '#' + t).join(' ')) : '',
            latest && latest.value != null ? `${latest.value} kg` : '',
            latest ? 'agg. ' + fmtDate(latest.date) : '',
          ].filter(Boolean).join(' · ');
          list.appendChild(el('div', {
            class: 'ac-item',
            onClick: () => { done({ name: ex.name, tags: ex.tags || [] }); closeModal(); },
          }, [
            el('div', { class: 'ac-name', text: ex.name }),
            sub ? el('div', { class: 'ac-sub', text: sub }) : null,
          ].filter(Boolean)));
        });
      }

      // Sezione: suggeriti dalla libreria
      if (sugg.length) {
        list.appendChild(sectionHead('Suggeriti'));
        sugg.slice(0, 60).forEach((s) => {
          list.appendChild(el('div', {
            class: 'ac-item',
            onClick: () => { done({ name: s.name, tags: s.tags || [] }); closeModal(); },
          }, [
            el('div', { class: 'ac-name', text: s.name }),
            (s.tags || []).length ? el('div', { class: 'ac-sub', text: s.tags.map((t) => '#' + t).join(' ') }) : null,
          ].filter(Boolean)));
        });
      }

      // stato vuoto
      if (!mine.length && !sugg.length && !q) {
        list.appendChild(el('div', { class: 'ac-item muted', text: 'Nessun esercizio. Scrivi un nome per crearne uno.' }));
      }
    };

    search.addEventListener('input', renderList);

    const body = el('div', {}, [
      search,
      tagBar,
      el('p', { class: 'muted small', text: 'Riusa un tuo esercizio (mantiene lo storico), scegline uno suggerito o creane uno nuovo.' }),
      list,
    ]);

    const modal = openModal(title, body, [
      { label: 'Annulla', class: 'btn-ghost', onClick: (c) => { done(null); c(); } },
    ]);
    const closeModal = () => modal.close();

    // Se il modale viene chiuso in qualunque modo (✕, Escape, tap sul backdrop)
    // senza una selezione, risolviamo comunque la Promise con null.
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      const observer = new MutationObserver(() => {
        if (!document.body.contains(backdrop)) {
          observer.disconnect();
          done(null);
        }
      });
      observer.observe(document.getElementById('modalRoot'), { childList: true });
    }

    renderTagBar();
    renderList();
    setTimeout(() => search.focus(), 60);
  });
}
