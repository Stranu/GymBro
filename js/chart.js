/* GymBro - grafico a linee su canvas, senza dipendenze */

/**
 * Disegna un grafico a linee.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} series  [{ label, color, points: [{x: 'YYYY-MM-DD', y: number}] }]
 * @param {object} opts   { yLabel }
 */
export function lineChart(canvas, series, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const cssH = parseInt(canvas.getAttribute('height'), 10) || 200;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { top: 12, right: 12, bottom: 26, left: 38 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;

  // raccogli tutti i punti
  const allPts = series.flatMap((s) => s.points);
  if (allPts.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Nessun dato', cssW / 2, cssH / 2);
    return;
  }

  // asse X: tempo (usa date come timestamp)
  const xs = allPts.map((p) => new Date(p.x).getTime());
  const ys = allPts.map((p) => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (xMin === xMax) { xMin -= 86400000; xMax += 86400000; }
  // margine y
  const yRange = yMax - yMin || 1;
  yMin = Math.max(0, yMin - yRange * 0.12);
  yMax = yMax + yRange * 0.12;

  const xToPx = (t) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const yToPx = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  // griglia + etichette Y
  ctx.strokeStyle = '#334155';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui';
  ctx.lineWidth = 1;
  const yTicks = 4;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (i / yTicks) * (yMax - yMin);
    const y = yToPx(v);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(cssW - pad.right, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(Math.round(v * 10) / 10, pad.left - 6, y);
  }

  // etichette X (prima e ultima data)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const fmt = (t) => {
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  ctx.fillText(fmt(xMin), pad.left, cssH - pad.bottom + 6);
  ctx.fillText(fmt(xMax), cssW - pad.right, cssH - pad.bottom + 6);

  // disegna le serie
  series.forEach((s) => {
    if (!s.points.length) return;
    const pts = [...s.points].sort((a, b) => new Date(a.x) - new Date(b.x));
    ctx.strokeStyle = s.color || '#38bdf8';
    ctx.fillStyle = s.color || '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xToPx(new Date(p.x).getTime());
      const y = yToPx(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // punti
    pts.forEach((p) => {
      const x = xToPx(new Date(p.x).getTime());
      const y = yToPx(p.y);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// palette per serie multiple (grafici per tag)
export const PALETTE = [
  '#38bdf8', '#f59e0b', '#22c55e', '#ef4444', '#a78bfa',
  '#ec4899', '#14b8a6', '#eab308', '#fb923c', '#60a5fa',
];
