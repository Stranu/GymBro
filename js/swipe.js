/* GymBro - helper swipe orizzontale per righe (portato da IndiSpesabile).
 *
 * Avvolge una riga in un wrapper con un background rivelato (reveal) e sposta
 * la riga con il dito. Oltre soglia scatta l'azione. Usa eventi TOUCH (non
 * pointer) per non entrare in conflitto col riordino basato su Pointer Events
 * della view scheda: il riordino parte da `pointerdown` sulla `.drag-handle`,
 * lo swipe parte da `touchstart` sul resto della riga e si auto-esclude quando
 * il gesto inizia sulla maniglia.
 *
 * API identica a IndiSpesabile: swipeRow(rowEl, opts) -> { element, detach }
 * dove `element` è il wrapper `.swipe-wrap` da montare al posto della riga.
 *   - Swipe a SINISTRA  -> reveal lato destro + onSwipeLeft() oltre soglia.
 *   - Swipe a DESTRA    -> reveal lato sinistro + onSwipeRight() oltre soglia.
 *     Omettere onSwipeRight disabilita il gesto verso destra.
 */
import { el } from './ui.js';

// GymBro non esporta un helper `haptic`; lo definiamo localmente, coerente con
// l'uso inline di `navigator.vibrate` già presente in tools.js e scheda.js.
const haptic = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

export function swipeRow(rowEl, {
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Fatto',
  leftIcon = '✓',
  rightLabel = '',
  rightIcon = '',
} = {}) {
  const THRESHOLD = 96;         // px oltre cui l'azione scatta
  const DIRECTION_LOCK = 12;    // px di traslazione orizzontale prima di impegnarsi
  const allowRight = typeof onSwipeRight === 'function';
  const allowLeft = typeof onSwipeLeft === 'function';

  // Background: un reveal verso destra (lato sinistro) e uno verso sinistra (lato destro).
  const rightReveal = el('div', { class: 'swipe-reveal swipe-reveal-right' }, [
    el('span', { class: 'swipe-ic', 'aria-hidden': 'true' }, rightIcon),
    el('span', { class: 'swipe-tx' }, rightLabel),
  ]);
  const leftReveal = el('div', { class: 'swipe-reveal swipe-reveal-left' }, [
    el('span', { class: 'swipe-tx' }, leftLabel),
    el('span', { class: 'swipe-ic', 'aria-hidden': 'true' }, leftIcon),
  ]);

  const bg = el('div', { class: 'swipe-bg' }, [rightReveal, leftReveal]);
  rowEl.classList.add('swipe-fg');
  const wrapper = el('div', { class: 'swipe-wrap' }, [bg, rowEl]);

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;    // impegnato in uno swipe orizzontale
  let decided = false;     // direzione decisa per questo gesto

  function setTranslate(x) {
    rowEl.style.transform = x ? `translateX(${x}px)` : '';
    // Mostra solo il reveal del lato giusto, intensifica oltre soglia.
    const past = Math.abs(x) >= THRESHOLD;
    if (x < 0) {
      leftReveal.classList.add('visible');
      rightReveal.classList.remove('visible');
      leftReveal.classList.toggle('armed', past);
    } else if (x > 0) {
      rightReveal.classList.add('visible');
      leftReveal.classList.remove('visible');
      rightReveal.classList.toggle('armed', past);
    } else {
      leftReveal.classList.remove('visible', 'armed');
      rightReveal.classList.remove('visible', 'armed');
    }
  }

  function reset(animate) {
    if (animate) rowEl.classList.add('swipe-animate');
    setTranslate(0);
    if (animate) {
      setTimeout(() => rowEl.classList.remove('swipe-animate'), 200);
    }
    dx = 0;
    dragging = false;
    decided = false;
  }

  let ignore = false; // true quando il gesto parte sulla maniglia di riordino

  function onTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    // Un gesto che parte sulla maniglia di riordino non è uno swipe.
    ignore = !!(t.target.closest && t.target.closest('.drag-handle'));
    startX = t.clientX;
    startY = t.clientY;
    dx = 0;
    dragging = false;
    decided = false;
  }

  function onTouchMove(e) {
    if (ignore) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const mx = t.clientX - startX;
    const my = t.clientY - startY;

    if (!decided) {
      if (Math.abs(mx) < DIRECTION_LOCK && Math.abs(my) < DIRECTION_LOCK) return;
      // Impegna all'orizzontale solo se chiaramente più orizzontale che verticale.
      if (Math.abs(mx) > Math.abs(my)) {
        dragging = true;
      }
      decided = true;
      if (!dragging) return; // scroll verticale — lascialo stare
    }
    if (!dragging) return;

    // Clamp alle direzioni consentite.
    let x = mx;
    if (x > 0 && !allowRight) x = 0;
    if (x < 0 && !allowLeft) x = 0;
    dx = x;
    rowEl.classList.remove('swipe-animate');
    setTranslate(x);
  }

  // Soppressione tap-after-swipe (vedi MEDIUM-2 della design review): dopo uno
  // swipe oltre soglia marca il foreground con un flag di breve durata, così i
  // click handler della riga (es. .ex-main / .ex-weight-col) possono ignorare
  // il click sintetico residuo e non aprire sheet/dialog peso.
  function markSwipeFired() {
    rowEl.dataset.swipeJustFired = '1';
    setTimeout(() => { delete rowEl.dataset.swipeJustFired; }, 400);
  }

  function onTouchEnd() {
    if (!dragging) { reset(false); return; }
    if (dx <= -THRESHOLD && allowLeft) {
      haptic(15);
      markSwipeFired();
      onSwipeLeft();
      reset(true);
    } else if (dx >= THRESHOLD && allowRight) {
      haptic(15);
      markSwipeFired();
      onSwipeRight();
      reset(true);
    } else {
      reset(true);
    }
  }

  // Handler nominato per touchcancel: la stessa reference è usata in add e
  // remove, così detach() rimuove davvero tutti e quattro i listener (nel
  // sorgente IndiSpesabile touchcancel usava una funzione anonima e non veniva
  // mai rimosso).
  const onTouchCancel = () => reset(true);

  rowEl.addEventListener('touchstart', onTouchStart, { passive: true });
  rowEl.addEventListener('touchmove', onTouchMove, { passive: true });
  rowEl.addEventListener('touchend', onTouchEnd);
  rowEl.addEventListener('touchcancel', onTouchCancel, { passive: true });

  function detach() {
    rowEl.removeEventListener('touchstart', onTouchStart);
    rowEl.removeEventListener('touchmove', onTouchMove);
    rowEl.removeEventListener('touchend', onTouchEnd);
    rowEl.removeEventListener('touchcancel', onTouchCancel);
  }

  return { element: wrapper, detach };
}
