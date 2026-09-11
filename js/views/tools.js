/* GymBro - barra strumenti scheda: contatore serie + timer di recupero con beep */
import { el } from '../ui.js';

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  // Alcuni browser sospendono il contesto finché non c'è un gesto utente.
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Beep sonoro tramite Web Audio API (nessun file esterno). */
function beep(times = 3) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t = now + i * 0.32;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  }
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/* ---------------- Stato modulo (persistente finché la view scheda è montata) ---------------- */
let repCount = 0;
let timerState = {
  running: false,
  remaining: 0,   // secondi
  total: 0,
  intervalId: null,
  lastPreset: 90, // default recupero in secondi
};

// riferimenti DOM aggiornati a ogni render
let refs = {};
let expanded = false; // stato locale: pannello timer aperto o no

/**
 * Barra strumenti compatta (Opzione A): una sola riga con contatore serie a
 * sinistra e timer a destra. Toccando il tempo si espandono i controlli fini
 * (−15/+15/↺), che si richiudono da soli all'avvio o con un altro tap.
 * @param {object} opts { defaultRestSeconds }
 */
export function createToolbar({ defaultRestSeconds } = {}) {
  if (defaultRestSeconds && !timerState.running) timerState.lastPreset = defaultRestSeconds;

  // --- Contatore serie (compatto) ---
  const counterValue = el('div', { class: 'tc-count-value', text: String(repCount) });
  const counter = el('div', { class: 'tc-counter' }, [
    el('button', { class: 'tc-btn', 'aria-label': 'Meno serie', onClick: () => setRep(repCount - 1) }, '−'),
    el('div', { class: 'tc-count-wrap', onClick: () => setRep(0), title: 'Tocca per azzerare' }, [
      counterValue,
      el('div', { class: 'tc-count-label', text: 'serie' }),
    ]),
    el('button', { class: 'tc-btn', 'aria-label': 'Più serie', onClick: () => setRep(repCount + 1) }, '+'),
  ]);

  // --- Timer (compatto + pannello espandibile) ---
  const timerDisplay = el('div', {
    class: 'tc-timer-value' + (timerState.running ? ' running' : ''),
    onClick: toggleTimer, title: 'Avvia / pausa',
  }, fmtTime(timerState.running ? timerState.remaining : timerState.lastPreset));

  const startBtn = el('button', { class: 'tc-play', 'aria-label': 'Avvia/Pausa', onClick: toggleTimer }, timerState.running ? '⏸' : '▶');

  // riga sempre visibile del timer
  const timerMain = el('div', { class: 'tc-timer-main' }, [
    el('button', {
      class: 'tc-caret', 'aria-label': 'Altri controlli',
      onClick: () => { expanded = !expanded; syncExpanded(); },
    }, '⚙'),
    timerDisplay,
    startBtn,
  ]);

  // pannello espandibile con i controlli fini
  const panel = el('div', { class: 'tc-panel' }, [
    el('button', { class: 'tc-btn tc-btn-sm', 'aria-label': '-15s', onClick: () => adjustTimer(-15) }, '−15'),
    el('button', { class: 'tc-btn tc-btn-sm', 'aria-label': '+15s', onClick: () => adjustTimer(15) }, '+15'),
    el('button', { class: 'tc-btn tc-btn-sm', 'aria-label': 'Azzera', onClick: resetTimer }, '↺'),
  ]);

  const timer = el('div', { class: 'tc-timer' }, [panel, timerMain]);

  const bar = el('div', { class: 'workout-tools-compact' }, [counter, timer]);

  refs = { counterValue, timerDisplay, startBtn, bar, panel };
  syncExpanded();
  // se il timer era in corsa (es. torni sulla scheda) ricollega il tick al nuovo DOM
  if (timerState.running) attachTick();
  return bar;

  function setRep(v) {
    repCount = Math.max(0, v);
    counterValue.textContent = String(repCount);
    vibrate(10);
  }

  function syncExpanded() {
    refs.bar && refs.bar.classList.toggle('tc-expanded', expanded);
  }
}

/* ---------------- Timer logic ---------------- */
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function updateTimerDisplay() {
  if (refs.timerDisplay) {
    refs.timerDisplay.textContent = fmtTime(timerState.running ? timerState.remaining : timerState.lastPreset);
    refs.timerDisplay.classList.toggle('running', timerState.running);
  }
}

function updateStartBtn() {
  if (refs.startBtn) refs.startBtn.textContent = timerState.running ? '⏸' : '▶';
}

// richiude il pannello dei controlli fini (usato quando il timer parte)
function collapsePanel() {
  expanded = false;
  if (refs.bar) refs.bar.classList.remove('tc-expanded');
}

function toggleTimer() {
  ensureAudio(); // sblocca l'audio col gesto utente
  if (timerState.running) {
    // pausa
    timerState.running = false;
    clearTick();
  } else {
    // avvia: se azzerato usa il preset
    if (timerState.remaining <= 0) {
      timerState.remaining = timerState.lastPreset;
      timerState.total = timerState.lastPreset;
    }
    timerState.running = true;
    attachTick();
    collapsePanel();
  }
  updateStartBtn();
  updateTimerDisplay();
}

function attachTick() {
  clearTick();
  let last = Date.now();
  timerState.intervalId = setInterval(() => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    timerState.remaining -= dt;
    if (timerState.remaining <= 0) {
      timerState.remaining = 0;
      finishTimer();
    }
    updateTimerDisplay();
  }, 250);
}

function clearTick() {
  if (timerState.intervalId) { clearInterval(timerState.intervalId); timerState.intervalId = null; }
}

function finishTimer() {
  timerState.running = false;
  clearTick();
  updateStartBtn();
  beep(3);
  vibrate([200, 100, 200, 100, 200]);
}

function adjustTimer(delta) {
  ensureAudio();
  if (timerState.running) {
    timerState.remaining = Math.max(0, timerState.remaining + delta);
  } else {
    timerState.lastPreset = Math.max(5, timerState.lastPreset + delta);
    timerState.remaining = 0;
  }
  updateTimerDisplay();
}

function resetTimer() {
  timerState.running = false;
  clearTick();
  timerState.remaining = 0;
  updateStartBtn();
  updateTimerDisplay();
}

/** Avvia il timer con una durata specifica (usato dal tasto "recupero" degli esercizi). */
export function startTimerWith(seconds) {
  ensureAudio();
  timerState.lastPreset = Math.max(5, Math.round(seconds));
  timerState.remaining = timerState.lastPreset;
  timerState.total = timerState.lastPreset;
  timerState.running = true;
  attachTick();
  updateStartBtn();
  updateTimerDisplay();
}

/** Ferma tutto (chiamare quando si lascia la view scheda). */
export function teardownTools() {
  clearTick();
  timerState.running = false;
}
