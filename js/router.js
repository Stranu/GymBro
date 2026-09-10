/* GymBro - router hash-based semplice */

const routes = {};
let currentRoute = null;

/**
 * Registra una view.
 * @param {string} name         es. 'schede', 'scheda'
 * @param {function} renderFn   (mount, params) => void  (può essere async)
 */
export function register(name, renderFn) {
  routes[name] = renderFn;
}

export function parseHash() {
  // formato: #/schede  oppure  #/scheda/<id>  oppure  #/esercizio/<id>
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const name = parts[0] || 'schede';
  const params = parts.slice(1);
  return { name, params };
}

export function navigate(path) {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
}

export function back() {
  history.back();
}

export function getCurrent() {
  return currentRoute;
}

const changeListeners = [];
export function onRouteChange(fn) { changeListeners.push(fn); }

export async function handleRoute() {
  const { name, params } = parseHash();
  const view = document.getElementById('view');
  const renderFn = routes[name] || routes['schede'];
  currentRoute = { name, params };
  // scroll in cima ad ogni cambio view
  const main = document.getElementById('view');
  view.innerHTML = '';
  try {
    await renderFn(view, params);
  } catch (err) {
    console.error('Errore render view', name, err);
    view.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Errore nel caricamento della vista.</p></div>';
  }
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
  changeListeners.forEach((fn) => { try { fn(currentRoute); } catch (e) { console.error(e); } });
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  if (!location.hash) location.hash = '#/schede';
  else handleRoute();
}
