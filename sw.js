/* GymBro service worker - offline cache con auto-aggiornamento */

/*
 * IMPORTANTE: cambia CACHE_VERSION a ogni release (o a ogni volta che vuoi
 * forzare l'aggiornamento). Il cambiamento di questo file fa sì che il browser
 * scarichi la nuova versione, ripulisca la vecchia cache e attivi l'update.
 */
const CACHE_VERSION = 'v6';
const CACHE = 'gymbro-' + CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/exercise-library.js',
  './js/ui.js',
  './js/router.js',
  './js/chart.js',
  './js/views/schede.js',
  './js/views/scheda.js',
  './js/views/tools.js',
  './js/views/picker.js',
  './js/views/esercizi.js',
  './js/views/grafici.js',
  './js/views/impostazioni.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
  // NB: NON chiamiamo skipWaiting qui automaticamente: lo attiviamo su messaggio
  // dalla pagina, così l'update avviene in modo controllato.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La pagina può chiedere al SW in attesa di attivarsi subito.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isAppCode(url) {
  // HTML e JS: vogliamo sempre l'ultima versione quando c'è rete.
  return url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.html') ||
         url.pathname.endsWith('/') ||
         url.pathname.endsWith('.webmanifest');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Solo richieste same-origin passano dalla nostra logica.
  if (url.origin !== self.location.origin) return;

  if (isAppCode(url)) {
    // NETWORK-FIRST: prova la rete (versione fresca), fallback alla cache offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
  } else {
    // CACHE-FIRST per le risorse statiche (icone, ecc.).
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
  }
});
