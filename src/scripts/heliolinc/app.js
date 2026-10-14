// Interactive HelioLinC page: (1) Crocco's tracklets transformed under the
// reader's assumed distance and radial velocity; (2) the notebook's simulated
// survey in arrow space, brought into focus with gamma-dot; (3) the full
// linking search, run on request in a worker and scored against the truth.
// Nothing moves on its own; the survey file loads when section 2 is near.
import * as hl from './linking.js';

const DEG = Math.PI / 180, AS = hl.ARCSEC;
const COLORS = { ink: '#18323f', text: '#5b6f7c', grid: '#e7eff1', axis: '#cfdde2', teal: '#078d97',
  radius: '#c4160c', grey: 'rgba(110,128,138,0.55)', pure: '#078d97', valid: '#d98a1c', err: '#c4160c' };
// Nine nights, early to late (viridis)
const NIGHT = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#9bcf2d', '#d8c51c'];
const TAB20 = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5'];
const objColour = (o) => TAB20[(o * 7919) % 20];
const D_T = 5;                 // days: H18's velocity weighting, used for the spread readout
const D_ADOPTED = 1e-3;        // rad: the cluster radius adopted in the notebook

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
function sci(x, digits = 1) {
  if (x === 0) return '0';
  const s = x < 0 ? '−' : '';
  x = Math.abs(x);
  let e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  if (Number(m.toFixed(digits)) >= 10) { e += 1; m /= 10; }
  const ms = Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(digits);
  return `${s}${ms} × 10${sup(e)}`;
}
const fmt = (x, d = 0) => x.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });

function fit(canvas) {
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
function ticks(lo, hi, target = 5) {
  const s = niceStep(hi - lo, target), out = [];
  for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9 * s; v += s) out.push(Number(v.toPrecision(12)));
  return out;
}
const tickLabel = (v) => (Math.abs(v) < 1e-12 ? '0' : String(Number(v.toPrecision(6))).replace('-', '−'));

/**
 * Draw axes into a canvas and return the data-to-pixel mapping. Options:
 * x0, x1, y0, y1 (data range; x0 > x1 inverts), xlog, ylog, xlabel, ylabel,
 * equal (same scale on both axes, in units of pixels), xfmt, yfmt.
 */
function frame(ctx, w, h, o) {
  const L = o.left ?? 52, R = 12, T = 12, B = 38;
  let pw = w - L - R, ph = h - T - B;
  let { x0, x1, y0, y1 } = o;
  if (o.equal) {                        // widen the shorter range to keep the aspect ratio
    const sx = Math.abs(x1 - x0) / pw, sy = Math.abs(y1 - y0) / ph, s = Math.max(sx, sy);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dir = Math.sign(x1 - x0);
    x0 = cx - (dir * s * pw) / 2; x1 = cx + (dir * s * pw) / 2; y0 = cy - (s * ph) / 2; y1 = cy + (s * ph) / 2;
  }
  const tx = (v) => (o.xlog ? Math.log10(v) : v), ty = (v) => (o.ylog ? Math.log10(v) : v);
  const X = (v) => L + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * pw;
  const Y = (v) => T + ph - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * ph;
  const xt = o.xlog ? logTicks(Math.min(x0, x1), Math.max(x0, x1)) : ticks(Math.min(x0, x1), Math.max(x0, x1), o.xticks ?? 5);
  const yt = o.ylog ? logTicks(y0, y1) : ticks(y0, y1, o.yticks ?? 5);
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
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  }
  return out;
}
const logLabel = (v) => {
  const e = Math.floor(Math.log10(v) + 1e-9), m = Math.round(v / 10 ** e);
  return m === 1 ? `10${sup(e)}` : `${m}×10${sup(e)}`;
};

export function startHelioLinC(meta, base) {
  const $ = (id) => document.getElementById(id);

  // =============================== 1. Crocco ======================================
  const C = meta.crocco;
  const nC = C.t.length;
  const detC = { jd: Float64Array.from(C.t, (t) => t + C.windowCentreJD), ra: Float64Array.from(C.ra),
    dec: Float64Array.from(C.dec), tracklet: Int32Array.from(C.t, (_, i) => Math.floor(i / 3)) };
  const nightC = C.t.map((t) => Math.round((t + 12) / 3));
  const zC = hl.prepare(detC, C.windowCentreJD, 0.4).frame[2];
  const sky = $('hl-c-sky'), helio = $('hl-c-helio'), arr = $('hl-c-arrows');
  const gIn = $('hl-gamma'), gdIn = $('hl-gdot');
  let pending = false;
  const redrawC = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; drawC(); }); } };

  function drawSky() {
    const { ctx, w, h } = fit(sky);
    const ra = C.ra.map((v) => v / DEG), dec = C.dec.map((v) => v / DEG);
    const pad = 0.15;
    const f = frame(ctx, w, h, { x0: Math.max(...ra) + pad, x1: Math.min(...ra) - pad, y0: Math.min(...dec) - pad, y1: Math.max(...dec) + pad,
      xlabel: 'RA (°)', ylabel: 'Dec (°)', equal: true });
    for (let i = 0; i < nC; i++) dot(ctx, f.X(ra[i]), f.Y(dec[i]), 3.2, NIGHT[nightC[i]]);
  }
  function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }

  function drawC() {
    const g = Number(gIn.value), gd = Number(gdIn.value) * 1e-3;
    $('hl-gamma-out').textContent = `γ = ${g.toFixed(3)}  (r ≈ ${(1 / g).toFixed(2)} au)`;
    $('hl-gdot-out').textContent = `γ̇ = ${gd === 0 ? '0' : sci(gd, 2)} per day`;
    const p = hl.prepare(detC, C.windowCentreJD, g, zC);
    const { hx, hy } = hl.heliocentricTangent(p, gd);
    const a = hl.fitArrows(p, gd);
    const m = a.length / 4;
    // (b) heliocentric tangent plane
    {
      const { ctx, w, h } = fit(helio);
      const xs = [...hx].map((v) => v / DEG), ys = [...hy].map((v) => v / DEG);
      const f = frame(ctx, w, h, { x0: -4.5, x1: 4.5, y0: Math.min(...ys) - 0.4, y1: Math.max(...ys) + 0.4,
        xlabel: 'heliocentric x/z₀ (°)', ylabel: 'y/z₀ (°)', equal: true });
      f.clip();
      for (let i = 0; i < nC; i++) dot(ctx, f.X(xs[i]), f.Y(ys[i]), 3.2, NIGHT[nightC[i]]);
      ctx.restore();
    }
    // (c) the arrows, relative to their mean, with rate differences x d_t
    const c = [0, 0, 0, 0];
    for (let j = 0; j < m; j++) for (let q = 0; q < 4; q++) c[q] += a[4 * j + q] / m;
    const spread = hl.metricSpread(a, D_T);
    {
      const { ctx, w, h } = fit(arr);
      const H = 900;
      const f = frame(ctx, w, h, { x0: -H, x1: H, y0: -H, y1: H, xlabel: 'α − ⟨α⟩ (″)', ylabel: 'β − ⟨β⟩ (″)', equal: true });
      f.clip();
      ctx.strokeStyle = COLORS.radius; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(f.X(0), f.Y(0), f.X(D_ADOPTED / AS) - f.X(0), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      for (let j = 0; j < m; j++) {
        const x = (a[4 * j] - c[0]) / AS, y = (a[4 * j + 1] - c[1]) / AS;
        const ux = (D_T * (a[4 * j + 2] - c[2])) / AS, uy = (D_T * (a[4 * j + 3] - c[3])) / AS;
        ctx.strokeStyle = NIGHT[j]; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(f.X(x), f.Y(y)); ctx.lineTo(f.X(x + ux), f.Y(y + uy)); ctx.stroke();
        dot(ctx, f.X(x), f.Y(y), 3.4, NIGHT[j]);
      }
      ctx.restore();
    }
    $('hl-c-spread').textContent = `${fmt(spread / AS)}″`;
    $('hl-c-ratio').textContent = `${fmt(spread / D_ADOPTED, 2)} × the cluster radius`;
    const verdict = $('hl-c-verdict');
    verdict.textContent = spread < D_ADOPTED
      ? 'Inside the cluster radius: these nine tracklets would be linked.'
      : 'Outside the cluster radius: at this guess, the tracklets would not all be linked.';
    verdict.classList.toggle('is-bad', spread >= D_ADOPTED);
    arr.setAttribute('aria-label', `Crocco's nine arrows relative to their mean: RMS spread ${fmt(spread / AS)} arcseconds, against a cluster radius of 206 arcseconds.`);
  }
  gIn.addEventListener('input', redrawC);
  gdIn.addEventListener('input', redrawC);
  document.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => {
    const [g, gd] = b.dataset.guess === 'true' ? [C.gamma, C.gammaDot] : b.dataset.guess.split(',').map(Number);
    gIn.value = String(g); gdIn.value = String(gd * 1e3); drawC();
  }));
  $('hl-c-true').textContent = `γ = ${C.gamma.toFixed(3)} (r = ${(1 / C.gamma).toFixed(2)} au), γ̇ = ${sci(C.gammaDot, 2)} per day`;

  // ============================ 2. The whole field =================================
  let field = null;                  // {det, obj, cls, night, P, arrows, names, counts}
  let linkStatus = null;             // per tracklet, after a linking run
  const ov = $('hl-overview'), zoom = $('hl-zoom'), fgd = $('hl-field-gdot');
  const zoomSel = $('hl-zoom-size'), colourSel = document.getElementsByName('hl-colour');
  const box = { a: 0, b: 0 };
  let bounds = null, zoomHits = [];

  async function loadField() {
    if (field) return;
    $('hl-field-status').textContent = 'Loading the survey (1.5 MB)…';
    try {
      const [buf, names] = await Promise.all([
        fetch(`${base}${meta.file}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
        fetch(`${base}${meta.names}`).then((r) => r.json())
      ]);
      const f = hl.decodeField(buf, meta);
      const P = hl.prepare(f.det, meta.windowCentreJD, 0.4);
      const counts = new Map();
      for (const o of f.obj) counts.set(o, (counts.get(o) || 0) + 1);
      field = { ...f, P, names, counts, arrows: hl.fitArrows(P, 0) };
      // overview extent: the 0.2-99.8% range, so a few fast or distant objects do not set the scale
      const a0 = field.arrows, m0 = a0.length / 4;
      const pct = (k) => { const v = Float64Array.from({ length: m0 }, (_, j) => a0[4 * j + k]).sort(); return [v[Math.floor(0.002 * m0)], v[Math.floor(0.998 * m0)]]; };
      const [amin, amax] = pct(0), [bmin, bmax] = pct(1);
      bounds = { amin, amax, bmin, bmax };
      // start the zoom on an object seen on all nine nights, near the middle of the field
      const ca = (amin + amax) / 2, cb = (bmin + bmax) / 2;
      let best = 0, bestD = Infinity;
      for (let j = 0; j < m0; j++) {
        if (counts.get(f.obj[j]) < 9) continue;
        const dd = (a0[4 * j] - ca) ** 2 + (a0[4 * j + 1] - cb) ** 2;
        if (dd < bestD) { bestD = dd; best = j; }
      }
      box.a = a0[4 * best]; box.b = a0[4 * best + 1];
      $('hl-field-status').textContent = '';
      $('hl-field-status').hidden = true;
      $('hl-link').disabled = false;
      $('hl-link-status').textContent = 'Ready.';
      startWorker();
      drawField();
    } catch (e) {
      $('hl-field-status').textContent = 'The survey data could not be loaded. Please reload the page to try again.';
    }
  }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadField(); } }, { rootMargin: '400px' });
  io.observe($('hl-field'));

  const zoomHalf = () => (Number(zoomSel.value) * DEG) / 2;
  const colourMode = () => [...colourSel].find((r) => r.checked).value;

  function drawField() {
    if (!field) return;
    const gd = Number(fgd.value) * 1e-3;
    $('hl-field-gdot-out').textContent = `γ̇ = ${gd === 0 ? '0' : sci(gd, 1)} per day`;
    field.arrows = hl.fitArrows(field.P, gd);
    const a = field.arrows, m = a.length / 4;
    // overview
    {
      const { ctx, w, h } = fit(ov);
      const pad = 0.2 * DEG;
      const f = frame(ctx, w, h, { x0: (bounds.amin - pad) / DEG, x1: (bounds.amax + pad) / DEG, y0: (bounds.bmin - pad) / DEG, y1: (bounds.bmax + pad) / DEG,
        xlabel: 'α (°)', ylabel: 'β (°)', equal: true, left: 40 });
      f.clip();
      ctx.fillStyle = 'rgba(24,50,63,0.35)';
      for (let j = 0; j < m; j++) ctx.fillRect(f.X(a[4 * j] / DEG) - 0.5, f.Y(a[4 * j + 1] / DEG) - 0.5, 1, 1);
      const hw = Math.max(zoomHalf() / DEG, 0.12);   // keep the smallest box visible
      ctx.fillStyle = 'rgba(196,22,12,0.18)';
      ctx.fillRect(f.X(box.a / DEG - hw), f.Y(box.b / DEG + hw), f.X(box.a / DEG + hw) - f.X(box.a / DEG - hw), f.Y(box.b / DEG - hw) - f.Y(box.b / DEG + hw));
      ctx.strokeStyle = COLORS.radius; ctx.lineWidth = 2;
      ctx.strokeRect(f.X(box.a / DEG - hw), f.Y(box.b / DEG + hw), f.X(box.a / DEG + hw) - f.X(box.a / DEG - hw), f.Y(box.b / DEG - hw) - f.Y(box.b / DEG + hw));
      ctx.restore();
      ov._f = f;
    }
    // zoom
    {
      const { ctx, w, h } = fit(zoom);
      const hw = zoomHalf();
      const f = frame(ctx, w, h, { x0: (box.a - hw) / DEG, x1: (box.a + hw) / DEG, y0: (box.b - hw) / DEG, y1: (box.b + hw) / DEG,
        xlabel: 'α (°)', ylabel: 'β (°)', equal: true });
      f.clip();
      const mode = colourMode();
      const len = (0.1 * 2 * hw) / 4.5e-3;     // days: a typical main-belt rate draws a tenth of the box
      zoomHits = [];
      const order = [];
      for (let j = 0; j < m; j++) {
        if (Math.abs(a[4 * j] - box.a) < 1.2 * hw && Math.abs(a[4 * j + 1] - box.b) < 1.2 * hw) order.push(j);
      }
      // draw unlinked or grey arrows first
      const colour = (j) => {
        if (mode === 'truth') return objColour(field.obj[j]);
        if (!linkStatus) return COLORS.grey;
        return [COLORS.grey, COLORS.err, COLORS.valid, COLORS.pure][linkStatus[j]];
      };
      const rank = (j) => (mode === 'link' && linkStatus ? linkStatus[j] : 1);
      order.sort((x, y) => rank(x) - rank(y));
      for (const j of order) {
        const x = f.X(a[4 * j] / DEG), y = f.Y(a[4 * j + 1] / DEG);
        const x2 = f.X((a[4 * j] + len * a[4 * j + 2]) / DEG), y2 = f.Y((a[4 * j + 1] + len * a[4 * j + 3]) / DEG);
        const c = colour(j);
        ctx.strokeStyle = c; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        dot(ctx, x, y, 2.4, c);
        zoomHits.push([x, y, j]);
      }
      // cluster radius for scale
      ctx.strokeStyle = 'rgba(24,50,63,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      const rpx = f.X((box.a + D_ADOPTED) / DEG) - f.X(box.a / DEG);
      ctx.beginPath(); ctx.arc(f.L + f.pw - rpx - 10, f.T + rpx + 10, rpx, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('d = 10⁻³ rad', f.L + f.pw - 8, f.T + 2 * rpx + 14);
      ctx.restore();
      $('hl-zoom-count').textContent = `${fmt(order.length)} arrows in view; lines show motion over ${fmt(len, len < 1 ? 2 : 1)} days.`;
      zoom.setAttribute('aria-label', `Zoomed view of arrow space: ${order.length} arrows, coloured by ${mode === 'truth' ? 'true object' : 'linking result'}.`);
    }
  }
  let fieldPending = false;
  const redrawField = () => { if (!fieldPending) { fieldPending = true; requestAnimationFrame(() => { fieldPending = false; drawField(); }); } };
  fgd.addEventListener('input', redrawField);
  zoomSel.addEventListener('change', drawField);
  [...colourSel].forEach((r) => r.addEventListener('change', drawField));

  function moveBox(a, b) {
    if (!bounds) return;
    box.a = Math.min(bounds.amax, Math.max(bounds.amin, a));
    box.b = Math.min(bounds.bmax, Math.max(bounds.bmin, b));
    drawField();
  }
  ov.addEventListener('click', (ev) => {
    if (!ov._f) return;
    const r = ov.getBoundingClientRect(), f = ov._f;
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    // invert the overview mapping numerically (linear axes)
    const ax = (v) => f.X(v), ay = (v) => f.Y(v);
    const a = ((x - ax(0)) / (ax(1) - ax(0))) * DEG, b = ((y - ay(0)) / (ay(1) - ay(0))) * DEG;
    moveBox(a, b);
  });
  ov.addEventListener('keydown', (ev) => {
    const s = zoomHalf();
    const moves = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    if (moves[ev.key]) { ev.preventDefault(); moveBox(box.a + moves[ev.key][0], box.b + moves[ev.key][1]); }
  });
  const hover = $('hl-zoom-hover');
  zoom.addEventListener('mousemove', (ev) => {
    if (!field) return;
    const r = zoom.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = 64;
    for (const [hx, hy, j] of zoomHits) { const dd = (hx - x) ** 2 + (hy - y) ** 2; if (dd < bd) { bd = dd; best = j; } }
    if (best === null) { hover.textContent = 'Point at an arrow to identify it.'; return; }
    const o = field.obj[best];
    const night = Math.round(field.det.jd[3 * best] - meta.windowCentreJD);
    const st = linkStatus ? [' Not in any cluster.', ' Only in erroneous clusters.', ' Linked, with interlopers (valid cluster).', ' Linked in a pure cluster.'][linkStatus[best]] : '';
    hover.textContent = `${field.names[o]} (${meta.classes[field.cls[best]]}): tracklet from ${night >= 0 ? '+' : '−'}${Math.abs(night)} days, one of ${field.counts.get(o)} in the survey.${st}`;
  });
  window.addEventListener('resize', () => { drawSky(); drawC(); drawField(); drawCharts(); });

  // ============================== 3. Link them =====================================
  let worker = null, runId = 0, busy = false;
  const runs = [];
  const sel = { d: $('hl-d'), dt: $('hl-dt'), grid: $('hl-grid'), fals: $('hl-false') };
  const GRIDS = {
    nominal: { gammas: [0.4], gammaDots: meta.notebook.gammaDots },
    'four-gamma': { gammas: [0.3, 0.35, 0.4, 0.45], gammaDots: meta.notebook.gammaDots },
    'nine-gammadot': { gammas: [0.4], gammaDots: [-4e-3, -3e-3, -2e-3, -1e-3, 0, 1e-3, 2e-3, 3e-3, 4e-3] },
    both: { gammas: [0.3, 0.35, 0.4, 0.45], gammaDots: [-4e-3, -3e-3, -2e-3, -1e-3, 0, 1e-3, 2e-3, 3e-3, 4e-3] }
  };
  function startWorker() {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const nightsJD = meta.nightsFromCentre.map((t) => t + meta.windowCentreJD);
    worker.postMessage({ type: 'init', det: field.det, obj: field.obj,
      field: { tRef: meta.windowCentreJD, lam0: meta.oppositionLongitudeDeg * DEG, half: Math.tan(meta.fieldHalfWidthDeg * DEG), nightsJD } });
    worker.onmessage = ({ data }) => {
      if (data.id !== runId) return;
      if (data.type === 'progress') { $('hl-link-status').textContent = `Linking… ${Math.round(100 * data.f)}% of the hypotheses done`; return; }
      busy = false;
      $('hl-link').disabled = false;
      linkStatus = data.status;
      const s = data.score;
      const run = { ...current(), score: s };
      runs.push(run);
      const pct = (100 * s.pureObjects) / meta.nFindable;
      $('hl-r-pure').textContent = `${fmt(s.pureObjects)} (${fmt(pct, 1)}%)`;
      $('hl-r-valid').textContent = fmt(s.validObjects);
      $('hl-r-err').textContent = fmt(s.erroneous);
      $('hl-r-clusters').textContent = fmt(s.clusters);
      const nb = notebookPoint(run);
      $('hl-link-status').textContent = `Done in ${fmt(data.ms / 1000, 1)} s.`
        + (nb ? ` The notebook found ${fmt(nb.pure_objects)} objects in pure clusters and ${fmt(nb.erroneous)} erroneous clusters with these settings.` : '')
        + (run.fals > 0 ? ' With false tracklets, this page draws its own random ones, so results differ slightly from the notebook’s.' : '');
      [...colourSel].find((r) => r.value === 'link').disabled = false;
      [...colourSel].find((r) => r.value === 'link').checked = true;
      drawField(); drawCharts();
    };
  }
  const current = () => ({ d: Number(sel.d.value), dt: Number(sel.dt.value), grid: sel.grid.value, fals: Number(sel.fals.value) });
  function notebookCurve(c) {
    if (c.fals > 0) return null;
    if (c.grid === 'nominal') return meta.notebook.scan[c.dt.toFixed(1)];
    if (c.dt === 5) return meta.notebook.gridScan[c.grid];
    return null;
  }
  function notebookPoint(c) {
    const curve = notebookCurve(c);
    if (!curve) return null;
    const k = meta.notebook.dGrid.findIndex((d) => Math.abs(d / c.d - 1) < 1e-6);
    return k >= 0 ? curve[k] : null;
  }
  $('hl-link').addEventListener('click', () => {
    if (!field || busy) return;
    busy = true;
    $('hl-link').disabled = true;
    const c = current();
    runId++;
    $('hl-link-status').textContent = c.fals > 0 ? 'Adding false tracklets and linking…' : 'Linking…';
    worker.postMessage({ type: 'link', id: runId, ...GRIDS[c.grid], d: c.d, dt: c.dt, falseRatio: c.fals, zDir: field.P.frame[2] });
  });
  Object.values(sel).forEach((s) => s.addEventListener('change', drawCharts));

  const chartPure = $('hl-chart-pure'), chartErr = $('hl-chart-err');
  function drawCharts() {
    const c = current();
    const curve = notebookCurve(c);
    const dg = meta.notebook.dGrid;
    const same = runs.filter((r) => r.dt === c.dt && r.grid === c.grid && r.fals === c.fals);
    for (const [cv, key, ylab, ylog] of [[chartPure, 'pure', 'objects in pure clusters', false], [chartErr, 'err', 'erroneous clusters + 1', true]]) {
      const { ctx, w, h } = fit(cv);
      const f = frame(ctx, w, h, { x0: dg[0], x1: dg[dg.length - 1], xlog: true, y0: ylog ? 1 : 0, y1: ylog ? 3e4 : meta.nFindable * 1.08,
        ylog, xlabel: 'cluster radius d (rad)', ylabel: ylab, xfmt: logLabel, yfmt: ylog ? logLabel : (v) => fmt(v), left: 56 });
      f.clip();
      if (!ylog) {
        ctx.strokeStyle = COLORS.teal; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(f.L, f.Y(meta.nFindable)); ctx.lineTo(f.L + f.pw, f.Y(meta.nFindable)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (curve) {
        ctx.strokeStyle = 'rgba(24,50,63,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath();
        curve.forEach((s, k) => { const v = key === 'pure' ? s.pure_objects : s.erroneous + 1; const x = f.X(dg[k]), y = f.Y(v); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      for (const r of same) dot(ctx, f.X(r.d), f.Y(key === 'pure' ? r.score.pureObjects : r.score.erroneous + 1), 4.5, COLORS.radius);
      ctx.restore();
    }
    $('hl-chart-note').textContent = curve
      ? 'Grey line: the notebook’s results with these settings. Red dots: your runs.'
      : 'The notebook did not compute this combination; red dots are your runs.';
  }

  drawSky(); drawC(); drawCharts();
}
