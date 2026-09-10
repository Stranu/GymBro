/* GymBro - entry point */
import * as router from './router.js';
import { toast } from './ui.js';
import { renderSchede } from './views/schede.js';
import { renderScheda } from './views/scheda.js';
import { renderEsercizi } from './views/esercizi.js';
import { renderEsercizio } from './views/esercizi.js';
import { renderGrafici } from './views/grafici.js';
import { renderImpostazioni } from './views/impostazioni.js';

// Registrazione view
router.register('schede', renderSchede);
router.register('scheda', renderScheda);
router.register('esercizi', renderEsercizi);
router.register('esercizio', renderEsercizio);
router.register('grafici', renderGrafici);
router.register('impostazioni', renderImpostazioni);

// Mappa route -> voce nav attiva
const NAV_FOR_ROUTE = {
  schede: 'schede',
  scheda: 'schede',
  esercizi: 'esercizi',
  esercizio: 'esercizi',
  grafici: 'grafici',
  impostazioni: 'impostazioni',
};

// Titoli header di default (le view possono sovrascrivere)
const TITLE_FOR_ROUTE = {
  schede: 'Le mie schede',
  esercizi: 'Catalogo esercizi',
  grafici: 'Grafici',
  impostazioni: 'Altro',
};

const bottomNav = document.getElementById('bottomNav');
const btnBack = document.getElementById('btnBack');
const btnMenu = document.getElementById('btnMenu');
const viewTitle = document.getElementById('viewTitle');

// Navigazione bottom nav
bottomNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  router.navigate(btn.dataset.nav);
});

// Tasto indietro
btnBack.addEventListener('click', () => history.back());

// Menu contestuale (semplice: va alle impostazioni)
btnMenu.addEventListener('click', () => router.navigate('impostazioni'));

// Aggiorna chrome (nav attiva, back button, titolo) ad ogni cambio route
router.onRouteChange((route) => {
  const navKey = NAV_FOR_ROUTE[route.name] || 'schede';
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === navKey);
  });
  // il tasto indietro appare nelle viste di dettaglio
  const isDetail = route.name === 'scheda' || route.name === 'esercizio';
  btnBack.hidden = !isDetail;
  // titolo di default (le view lo aggiornano se serve)
  if (TITLE_FOR_ROUTE[route.name]) viewTitle.textContent = TITLE_FOR_ROUTE[route.name];
});

// Espone helper per aggiornare il titolo dalle view
window.setViewTitle = (t) => { viewTitle.textContent = t; };

// Avvia router
router.startRouter();

// Registra service worker (solo se servito via http/https, non file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}

// Prompt installazione PWA
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  window.__canInstall = true;
});
window.triggerInstall = async () => {
  if (!deferredPrompt) {
    toast('Usa il menu del browser: "Aggiungi a schermata Home"');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
};
