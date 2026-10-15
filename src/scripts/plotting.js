// Small canvas-plotting helpers shared by the interactive pages.

export const COLORS = { ink: '#18323f', text: '#5b6f7c', grid: '#e7eff1', axis: '#cfdde2', teal: '#078d97', red: '#c4160c' };

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');

/** x in the form "1.5 × 10⁻³". */
export function sci(x, digits = 1) {
  if (x === 0) return '0';
  const s = x < 0 ? '−' : '';
  x = Math.abs(x);
  let e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  if (Number(m.toFixed(digits)) >= 10) { e += 1; m /= 10; }
  const ms = Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(digits);
  return `${s}${ms} × 10${sup(e)}`;
}
export const fmt = (x, d = 0) => x.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });
/** A number to about three significant figures, without exponent notation for 0.001-99999. */
export const sig = (x) => (x === 0 ? '0' : Math.abs(x) >= 1000 ? fmt(x) : String(Number(x.toPrecision(3))));

/** Size a canvas to its parent at the device pixel ratio and clear it; returns {ctx, w, h}. */
export function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceStep(span, target) {
  const raw = span / target, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw);
}
export function ticks(lo, hi, target = 5) {
  const s = niceStep(hi - lo, target), out = [];
  for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9 * s; v += s) out.push(Number(v.toPrecision(12)));
  return out;
}
export function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  }
  return out;
}
const tickLabel = (v) => (Math.abs(v) < 1e-12 ? '0' : String(Number(v.toPrecision(6))).replace('-', '−'));
export const logLabel = (v) => {
  if (v >= 0.01 && v <= 1000) return String(Number(v.toPrecision(3)));
  const e = Math.floor(Math.log10(v) + 1e-9), m = Math.round(v / 10 ** e);
  return m === 1 ? `10${sup(e)}` : `${m}×10${sup(e)}`;
};

/**
 * Draw axes and return the data-to-pixel mapping {X, Y, L, T, pw, ph, clip}.
 * Options: x0, x1, y0, y1 (x0 > x1 inverts), xlog, ylog, xlabel, ylabel,
 * xfmt, yfmt, xticks, yticks (targets or arrays), left (margin).
 */
export function frame(ctx, w, h, o) {
  const L = o.left ?? 52, R = o.right ?? 12, T = o.top ?? 12, B = 38;
  const pw = w - L - R, ph = h - T - B;
  const { x0, x1, y0, y1 } = o;
  const tx = (v) => (o.xlog ? Math.log10(v) : v), ty = (v) => (o.ylog ? Math.log10(v) : v);
  const X = (v) => L + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * pw;
  const Y = (v) => T + ph - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * ph;
  const xt = Array.isArray(o.xticks) ? o.xticks : o.xlog ? logTicks(Math.min(x0, x1), Math.max(x0, x1)) : ticks(Math.min(x0, x1), Math.max(x0, x1), o.xticks ?? 5);
  const yt = Array.isArray(o.yticks) ? o.yticks : o.ylog ? logTicks(y0, y1) : ticks(y0, y1, o.yticks ?? 5);
  ctx.font = '11px system-ui, sans-serif';
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (const v of xt) { ctx.moveTo(X(v), T); ctx.lineTo(X(v), T + ph); }
  for (const v of yt) { ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); }
  ctx.stroke();
  ctx.strokeStyle = COLORS.axis; ctx.strokeRect(L, T, pw, ph);
  ctx.fillStyle = COLORS.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xt) ctx.fillText((o.xfmt || tickLabel)(v), X(v), T + ph + 5);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt) ctx.fillText((o.yfmt || tickLabel)(v), L - 5, Y(v));
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(o.xlabel || '', L + pw / 2, h - 2);
  ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle';
  ctx.fillText(o.ylabel || '', 0, 0); ctx.restore();
  return { X, Y, L, T, pw, ph, clip: () => { ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip(); } };
}

export function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
