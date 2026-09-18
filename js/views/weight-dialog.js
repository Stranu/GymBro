/* GymBro - dialog condiviso per registrare il peso di un esercizio.
 * Usato sia dalla scheda (quickWeight) sia dal dettaglio esercizio (addWeight).
 */
import * as store from '../store.js';
import { el, openModal, toast, fmtDate, progressBadge, tryOr } from '../ui.js';

/**
 * Apre il dialog di registrazione peso.
 * @param {string} exerciseId
 * @param {object} opts
 *   - workoutId: collega la registrazione a una scheda (opzionale)
 *   - onSaved(): callback dopo un salvataggio riuscito (es. rerender)
 */
export async function openWeightDialog(exerciseId, { workoutId = null, onSaved } = {}) {
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
        const ok = await tryOr(() => store.logWeight(exerciseId, {
          value: valIn.value,
          note: noteIn.value.trim(),
          date: dateIn.value || store.todayISO(),
          workoutId,
        }), 'Salvataggio non riuscito');
        c();
        if (ok) {
          toast('Peso aggiornato');
          if (onSaved) await onSaved();
        }
      },
    },
  ]);
}
