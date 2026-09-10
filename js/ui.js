/* GymBro - helper UI: DOM, modal, toast, conferme */

/** Crea un elemento con attributi e figli. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'hidden') {
      if (v) node.setAttribute('hidden', '');
    } else {
      node.setAttribute(k, v);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------- TOAST ---------------- */
export function toast(msg, ms = 2200) {
  const root = document.getElementById('toastRoot');
  const t = el('div', { class: 'toast', text: msg });
  root.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.25s';
    setTimeout(() => t.remove(), 250);
  }, ms);
}

/* ---------------- MODAL ---------------- */
/**
 * Apre un bottom-sheet modale.
 * @param {string} title
 * @param {Node|Node[]} bodyNodes  contenuto
 * @param {Array} actions [{label, class, onClick(close)}]
 * @returns {{close: function}}
 */
export function openModal(title, bodyNodes, actions = []) {
  const root = document.getElementById('modalRoot');
  const vv = window.visualViewport;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (vv) {
      vv.removeEventListener('resize', onViewport);
      vv.removeEventListener('scroll', onViewport);
    }
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  // Gestione tastiera virtuale: invece di "spingere su" il modale (che per i
  // pannelli alti nasconde il campo in cima), vincoliamo l'altezza del modale
  // all'area visibile sopra la tastiera. Così il campo in alto resta sempre
  // visibile e il contenuto eccedente scorre internamente, coi pulsanti in fondo.
  const onViewport = () => {
    if (!vv) return;
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (keyboard > 60) {
      // tastiera aperta: vincola il modale all'area visibile e mettilo sopra la tastiera
      modal.style.maxHeight = (vv.height - 8) + 'px';
      backdrop.style.paddingBottom = keyboard + 'px';
    } else {
      // tastiera chiusa: ripristina i valori di default del CSS
      modal.style.maxHeight = '';
      backdrop.style.paddingBottom = '';
    }
    // porta in vista il campo attivo senza scavalcare la cima del modale
    const active = document.activeElement;
    if (active && modal.contains(active)) {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const body = el('div', {}, Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]);
  const actionRow = actions.length
    ? el('div', { class: 'modal-actions' },
        actions.map((a) =>
          el('button', {
            class: 'btn ' + (a.class || ''),
            onClick: () => a.onClick ? a.onClick(close) : close(),
          }, a.label)
        ))
    : null;

  const modal = el('div', { class: 'modal', onClick: (e) => e.stopPropagation() }, [
    el('div', { class: 'modal-head' }, [
      el('h2', { text: title }),
      el('button', { class: 'icon-btn', onClick: close, 'aria-label': 'Chiudi' }, '✕'),
    ]),
    body,
    actionRow,
  ].filter(Boolean));

  const backdrop = el('div', { class: 'modal-backdrop', onClick: close }, [modal]);
  root.appendChild(backdrop);

  if (vv) {
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
  }
  // quando un campo riceve il focus, riassesta la vista (utile al primo tap)
  modal.addEventListener('focusin', () => setTimeout(onViewport, 100));

  return { close, body };
}

/** Conferma sì/no. Ritorna Promise<boolean>. */
export function confirmDialog(title, message, { okLabel = 'Conferma', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal(title, el('p', { class: 'muted', text: message }), [
      { label: 'Annulla', class: 'btn-ghost', onClick: (close) => { close(); resolve(false); } },
      { label: okLabel, class: danger ? 'btn-danger' : 'btn-primary', onClick: (close) => { close(); resolve(true); } },
    ]);
  });
}

/** Prompt di testo. Ritorna Promise<string|null>. */
export function promptDialog(title, { label = '', value = '', placeholder = '', okLabel = 'Salva' } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', value, placeholder });
    const field = el('div', { class: 'field' }, [
      label ? el('label', { text: label }) : null,
      input,
    ].filter(Boolean));
    const m = openModal(title, field, [
      { label: 'Annulla', class: 'btn-ghost', onClick: (close) => { close(); resolve(null); } },
      { label: okLabel, class: 'btn-primary', onClick: (close) => { close(); resolve(input.value.trim()); } },
    ]);
    setTimeout(() => input.focus(), 50);
  });
}

/* ---------------- TAG helpers ---------------- */
export function tagChip(tag, { onRemove } = {}) {
  return el('span', { class: 'tag' }, [
    el('span', { text: '#' + tag }),
    onRemove ? el('span', { class: 'tag-remove', text: '✕', onClick: () => onRemove(tag) }) : null,
  ].filter(Boolean));
}

export function emptyState(icon, text, actionNode = null) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty-icon', text: icon }),
    el('p', { text }),
    actionNode,
  ].filter(Boolean));
}

/** Formatta data ISO (YYYY-MM-DD) in gg/mm/aaaa */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
