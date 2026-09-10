/* GymBro - selettore esercizio riutilizzabile (autocomplete + filtro tag + crea nuovo) */
import * as store from '../store.js';
import { el, clear, openModal, tagChip, fmtDate } from '../ui.js';

/**
 * Apre il picker. Ritorna Promise<{name, tags[]}|null>.
 * Se l'utente sceglie un esercizio esistente ne restituisce nome+tag (verrà
 * riusato via getOrCreateExercise, quindi nessun doppione). Se ne crea uno
 * nuovo, restituisce il nome digitato e i tag scelti.
 */
export async function openExercisePicker({ title = 'Scegli esercizio' } = {}) {
  const [exercises, tags] = await Promise.all([store.listExercises(), store.allTags()]);
  // ultimo peso per mostrare un contesto utile ("50 kg · agg. 12/07/2026")
  const latestMap = {};
  for (const ex of exercises) {
    latestMap[ex.id] = await store.getLatestWeight(ex.id);
  }

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

    const renderList = () => {
      const q = search.value.trim().toLowerCase();
      clear(list);
      let filtered = exercises;
      if (activeTag) filtered = filtered.filter((e) => (e.tags || []).includes(activeTag));
      if (q) filtered = filtered.filter((e) => e.name.toLowerCase().includes(q));

      // opzione: crea nuovo (se c'è testo e non esiste già identico)
      const exactExists = exercises.some((e) => e.name.toLowerCase() === q);
      if (q && !exactExists) {
        list.appendChild(el('div', {
          class: 'ac-item', style: 'background:rgba(56,189,248,0.08);',
          onClick: () => { done({ name: search.value.trim(), tags: activeTag ? [activeTag] : [] }); closeModal(); },
        }, [
          el('div', { class: 'ac-name', text: '➕ Crea "' + search.value.trim() + '"' }),
          el('div', { class: 'ac-sub', text: activeTag ? 'con tag #' + activeTag : 'nuovo esercizio' }),
        ]));
      }

      if (filtered.length === 0 && !q) {
        list.appendChild(el('div', { class: 'ac-item muted', text: 'Nessun esercizio nel catalogo. Scrivi un nome per crearne uno.' }));
      }

      filtered.slice(0, 50).forEach((ex) => {
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
    };

    search.addEventListener('input', renderList);

    const body = el('div', {}, [
      search,
      tagBar,
      el('p', { class: 'muted small', text: 'Riusa un esercizio già fatto (mantiene lo storico) o creane uno nuovo.' }),
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
