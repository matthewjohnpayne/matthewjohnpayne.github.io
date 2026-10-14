// Interactive resonance-overlap page: the analytic overlap diagram, the
// notebook's Lyapunov-time maps (or maps computed here in a pool of workers),
// and single orbits integrated on demand. Nothing runs until the reader asks,
// except drawing the analytic curves and loading the notebook map.
import * as ov from './physics.js';

const COLORS = {
  ink: '#18323f', text: '#5b6f7c', grid: '#e7eff1', axis: '#cfdde2',
  res: 'rgba(7,141,151,0.16)', resEdge: 'rgba(7,141,151,0.75)', dot: '#c4160c',
  overlap: '#d9662a', hill: '#3f6f8f', line: '#078d97', sep: 'rgba(150,150,150,0.9)'
};
// The notebook's colour scale (and DPH13's): log10(T_Ly/P1) from 0.5 to 2.76.
const STOPS = ['#03030f', '#0b1f55', '#2f6f80', '#4f9a6a', '#3a7f2e', '#7a2a12', '#c4160c', '#d9662a', '#eaa53a', '#f7ec4a'];
const LY_MIN = 0.5, LY_MAX = 2.76;
const LUT = (() => {
  const rgb = STOPS.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const lut = new Uint8ClampedArray(256 * 3);
  for (let k = 0; k < 256; k++) {
    const f = (k / 255) * (rgb.length - 1), i = Math.min(rgb.length - 2, Math.floor(f)), u = f - i;
    for (let c = 0; c < 3; c++) lut[3 * k + c] = rgb[i][c] + u * (rgb[i + 1][c] - rgb[i][c]);
  }
  return lut;
})();
const lutIndex = (v) => Math.round(255 * Math.min(1, Math.max(0, (v - LY_MIN) / (LY_MAX - LY_MIN))));

// Thresholds on ln d, the accumulated growth: a regular orbit's neighbour
// separates only polynomially (ln d of about 10 to 20 over these runs).
const LND_REGULAR = 20, LND_CHAOTIC = 40;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
function sci(x, digits = 1) {
  if (!Number.isFinite(x)) return String(x);
  let e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  if (Number(m.toFixed(digits)) >= 10) { e += 1; m /= 10; }
  const ms = Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(digits);
  return `${ms} × 10${sup(e)}`;
}
const fmt = (x, d = 0) => x.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Size a canvas to its box at the device pixel ratio; returns {ctx, w, h}. */
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
function ticks(lo, hi, target = 6) {
  const s = niceStep(hi - lo, target), out = [];
  for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9 * s; v += s) out.push(Number(v.toPrecision(12)));
  return out;
}

// Linear interpolation of y(x) for increasing xs.
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  return ys[lo] + ((x - xs[lo]) * (ys[hi] - ys[lo])) / (xs[hi] - xs[lo]);
}

/** Where the m+1:m and m+2:m+1 separatrices first meet (the notebook's separatrix_crossings). */
function crossings(eps, ms) {
  const out = [];
  for (const m of ms) {
    const [inner] = ov.resonanceSeparatrix(eps, m, { n: 1200, gammaMax: 3000 });
    const [, outer] = ov.resonanceSeparatrix(eps, m + 1, { n: 1200, gammaMax: 3000 });
    let k = 0;
    for (let i = 1; i < inner.sigma.length; i++) if (inner.sigma[i] < inner.sigma[k]) k = i;
    const sIn = inner.sigma.slice(k), pIn = inner.pr.slice(k);
    const lo = Math.max(sIn[0], outer.sigma[0]), hi = Math.min(sIn[sIn.length - 1], outer.sigma[outer.sigma.length - 1]);
    if (!(hi > lo)) continue;
    let prev = null;
    for (let j = 0; j <= 600; j++) {
      const s = lo + ((hi - lo) * j) / 600;
      const d = interp(s, sIn, pIn) - interp(s, outer.sigma, outer.pr);
      if (prev !== null && Math.sign(d) !== Math.sign(prev.d)) { out.push({ pr: interp(prev.s, sIn, pIn), sigma: prev.s, m }); break; }
      prev = { s, d };
    }
  }
  return out;
}

export function startResonanceOverlap(maps, base) {
  const $ = (id) => document.getElementById(id);
  startTheory($);
  startMaps($, maps, base);
}

// --- 1. The analytic diagram ----------------------------------------------------

function startTheory($) {
  const canvas = $('ro-theory-canvas');
  const slider = $('ro-eps'), out = $('ro-eps-out'), planets = $('ro-eps-planets');
  const X_LO = Math.log10(0.01), X_HI = Math.log10(1.15), S_MAX = 0.25;   // P2/P1 from 1.01 to 2.15
  const PR_TICKS = [1.01, 1.02, 1.05, 1.1, 1.2, 1.5, 2];
  let eps = 10 ** Number(slider.value), pending = false;

  function update() {
    eps = 10 ** Number(slider.value);
    out.textContent = sci(eps);
    const each = eps / 2;
    planets.textContent = each < 3e-5
      ? `Two planets of ${fmt(each / 3.003e-6, 1)} Earth masses each, around a Sun-like star.`
      : `Two planets of ${fmt(each / 9.546e-4, 2)} Jupiter masses each, around a Sun-like star.`;
    const pOverlap = ov.overlapPeriodRatio(eps), pHill = (1 + ov.hillDelta(eps)) ** 1.5;
    $('ro-overlap').textContent = `P₂/P₁ < ${pOverlap.toFixed(3)}`;
    $('ro-hill').textContent = `P₂/P₁ > ${pHill.toFixed(3)}`;
    $('ro-both').textContent = pOverlap > pHill ? `Yes: ${pHill.toFixed(3)}–${pOverlap.toFixed(3)}` : 'None';
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
  }

  function draw() {
    const { ctx, w, h } = fit(canvas);
    const L = 46, R = 12, T = 24, B = 40, pw = w - L - R, ph = h - T - B;
    const X = (pr) => L + ((Math.log10(pr - 1) - X_LO) / (X_HI - X_LO)) * pw;
    const Y = (s) => T + ph - (s / S_MAX) * ph;
    ctx.font = '11px system-ui, sans-serif';
    // Grid and axes
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (const p of PR_TICKS) { ctx.moveTo(X(p), T); ctx.lineTo(X(p), T + ph); }
    for (const s of ticks(0, S_MAX, 5)) { ctx.moveTo(L, Y(s)); ctx.lineTo(L + pw, Y(s)); }
    ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    // Resonances, m = 1 (2:1) to 99 (100:99)
    for (let m = 1; m < 100; m++) {
      const [a, b] = ov.resonanceSeparatrix(eps, m, { n: 220, gammaMax: 3000 });
      const path = new Path2D();
      let started = false;
      const add = (pr, s) => {
        if (!(pr > 1.001) || !Number.isFinite(s)) return;
        const x = X(pr), y = Y(Math.min(s, 2 * S_MAX));
        if (!started) { path.moveTo(x, y); started = true; } else path.lineTo(x, y);
      };
      for (let i = 0; i < a.pr.length; i++) add(a.pr[i], a.sigma[i]);
      for (let i = b.pr.length - 1; i >= 0; i--) add(b.pr[i], b.sigma[i]);
      ctx.fillStyle = COLORS.res; ctx.fill(path);
      ctx.strokeStyle = COLORS.resEdge; ctx.lineWidth = m < 10 ? 1 : 0.6; ctx.stroke(path);
    }
    // Where neighbours begin to overlap
    ctx.fillStyle = COLORS.dot;
    for (const c of crossings(eps, Array.from({ length: 60 }, (_, i) => i + 1))) {
      if (c.sigma > S_MAX) continue;
      ctx.beginPath(); ctx.arc(X(c.pr), Y(c.sigma), 2.6, 0, 2 * Math.PI); ctx.fill();
    }
    // Overlap criterion: circular below sigma = 1.33 eps^(3/7), eccentric above (DPH13)
    const sSwitch = 1.33 * eps ** (3 / 7);
    ctx.strokeStyle = COLORS.overlap; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    ctx.moveTo(X(ov.overlapPeriodRatio(eps)), Y(0)); ctx.lineTo(X(ov.overlapPeriodRatio(eps)), Y(sSwitch));
    for (let k = 1; k <= 60; k++) {
      const s = sSwitch + ((S_MAX - sSwitch) * k) / 60;
      ctx.lineTo(X(1 + 2.08 * (eps * s) ** 0.2), Y(s));
    }
    ctx.stroke();
    // Hill boundary (e2 = 0, quadrature)
    ctx.strokeStyle = COLORS.hill; ctx.setLineDash([2, 3]); ctx.beginPath();
    for (let k = 0; k <= 25; k++) {
      const s = (S_MAX * k) / 25, p = ov.hillPeriodRatio(eps, { e1: s, M1: Math.PI / 2 });
      if (k === 0) ctx.moveTo(X(p), Y(s)); else ctx.lineTo(X(p), Y(s));
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // Resonance labels along the top
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    for (const m of [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50]) {
      const x = X((m + 1) / m);
      if (x > L + 10 && x < L + pw - 10) ctx.fillText(`${m + 1}:${m}`, x, T - 8);
    }
    // Axes
    ctx.strokeStyle = COLORS.axis; ctx.strokeRect(L, T, pw, ph);
    ctx.fillStyle = COLORS.text;
    for (const p of PR_TICKS) ctx.fillText(String(p), X(p), T + ph + 15);
    ctx.fillText('initial period ratio P₂/P₁ (logarithmic in P₂/P₁ − 1)', L + pw / 2, h - 6);
    ctx.textAlign = 'right';
    for (const s of ticks(0, S_MAX, 5)) ctx.fillText(String(s), L - 6, Y(s) + 4);
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('eccentricity σ', 0, 0); ctx.restore();
    canvas.setAttribute('aria-label', `First-order resonances for total planet mass ${sci(eps)}. They overlap for period ratios below about ${ov.overlapPeriodRatio(eps).toFixed(3)} on circular orbits.`);
  }

  slider.addEventListener('input', update);
  document.querySelectorAll('.ro-chip[data-eps]').forEach((b) => b.addEventListener('click', () => {
    slider.value = String(Math.log10(Number(b.dataset.eps)));
    update();
  }));
  new ResizeObserver(draw).observe(canvas.parentElement);
  update();
}

// --- 2. Maps and single orbits -----------------------------------------------------

function startMaps($, maps, base) {
  const canvas = $('ro-map-canvas');
  const empty = $('ro-map-empty'), hover = $('ro-hover'), progress = $('ro-progress');
  const epsSel = $('ro-map-eps'), resSel = $('ro-res'), sepBox = $('ro-seps');
  const computeBtn = $('ro-compute');
  const m1Radios = [...document.querySelectorAll('input[name="ro-m1"]')];
  const srcRadios = [...document.querySelectorAll('input[name="ro-src"]')];
  const inputs = { eps: $('ro-o-eps'), pr: $('ro-o-pr'), e1: $('ro-o-e1'), m1: $('ro-o-m1'), len: $('ro-o-len') };
  const verdict = $('ro-verdict'), runBtn = $('ro-run');

  let notebook = null;               // Float32Array of the three notebook maps
  const browserMaps = new Map();     // key -> {nx, ny, values (NaN = not yet), range}
  let cursor = null, marker = null, pool = null, frame = 0;

  const state = () => ({
    eps: Number(epsSel.value), k: Number(m1Radios.find((r) => r.checked).value),
    src: srcRadios.find((r) => r.checked).value
  });
  const isNotebookEps = (eps) => Math.abs(eps / maps.eps - 1) < 1e-9;
  function range(eps) {
    if (isNotebookEps(eps)) return { pr: [maps.pr[0], maps.pr[1]], e1: [maps.e1[0], maps.e1[1]] };
    const d = ov.overlapPeriodRatio(eps) - 1;   // scale the axes with the overlap criterion
    return { pr: [1 + 0.5 * d, 1 + 3.5 * d], e1: [0, Math.min(0.3, d)] };
  }
  const browserKey = (eps, k, res) => `${eps}|${k}|${res}`;
  function current() {
    const { eps, k, src } = state(), r = range(eps);
    if (src === 'notebook') {
      if (!isNotebookEps(eps) || !notebook) return { r, map: null };
      const nx = maps.pr[2], ny = maps.e1[2];
      return { r, map: { nx, ny, values: notebook.subarray(k * nx * ny, (k + 1) * nx * ny) } };
    }
    return { r, map: browserMaps.get(browserKey(eps, k, resSel.value)) || null };
  }

  // Load the notebook map (about 270 kB)
  fetch(`${base}${maps.file}`).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.arrayBuffer();
  }).then((buf) => {
    const b = new Uint8Array(buf), e = maps.encoding;
    notebook = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) {
      notebook[i] = b[i] === e.negInf ? -Infinity : b[i] === e.posInf ? Infinity : ((b[i] - 1) / e.levels) * e.vmax;
    }
    draw();
  }).catch(() => { hover.textContent = 'The notebook map could not be loaded; you can still compute one in your browser.'; });

  // --- drawing the map
  const image = document.createElement('canvas');
  let layout = null;
  function draw() {
    const { ctx, w, h } = fit(canvas);
    const L = 50, R = 12, T = 10, B = 38, pw = w - L - R, ph = h - T - B;
    const { eps, k } = state();
    const { r, map } = current();
    const X = (pr) => L + ((pr - r.pr[0]) / (r.pr[1] - r.pr[0])) * pw;
    const Y = (e) => T + ph - ((e - r.e1[0]) / (r.e1[1] - r.e1[0])) * ph;
    layout = { L, T, pw, ph, r };
    ctx.fillStyle = '#eef3f4'; ctx.fillRect(L, T, pw, ph);
    if (map) {
      image.width = map.nx; image.height = map.ny;
      const ictx = image.getContext('2d'), img = ictx.createImageData(map.nx, map.ny);
      for (let j = 0; j < map.ny; j++) for (let i = 0; i < map.nx; i++) {
        const v = map.values[j * map.nx + i], p = 4 * ((map.ny - 1 - j) * map.nx + i);
        if (Number.isNaN(v)) continue;
        const q = 3 * lutIndex(v);
        img.data[p] = LUT[q]; img.data[p + 1] = LUT[q + 1]; img.data[p + 2] = LUT[q + 2]; img.data[p + 3] = 255;
      }
      ictx.putImageData(img, 0, 0);
      // Pixel centres sit on the grid values, so each pixel spans half a step either side.
      const dx = pw / (map.nx - 1), dy = ph / (map.ny - 1);
      ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, L - dx / 2, T - dy / 2, pw + dx, ph + dy);
      ctx.restore();
    }
    empty.hidden = Boolean(map);
    if (!map) {
      const { src } = state();
      empty.querySelector('p').textContent = src === 'notebook' && !isNotebookEps(eps)
        ? `The notebook map is for ε = ${sci(maps.eps)} only.`
        : src === 'notebook' ? 'Loading the notebook map…' : 'No map yet for this mass, phase and resolution.';
    }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    if (sepBox.checked) {
      ctx.strokeStyle = COLORS.sep; ctx.lineWidth = 1.4;
      const mLo = Math.max(1, Math.floor(1 / (r.pr[1] - 1)) - 1), mHi = Math.min(150, Math.ceil(1 / (r.pr[0] - 1)) + 1);
      for (let m = mLo; m <= mHi; m++) {
        for (const c of ov.resonanceSeparatrix(eps, m)) {
          ctx.beginPath();
          let on = false;
          for (let i = 0; i < c.pr.length; i++) {
            if (c.sigma[i] > r.e1[1] * 1.5 || !(c.pr[i] > 1)) { on = false; continue; }
            if (on) ctx.lineTo(X(c.pr[i]), Y(c.sigma[i])); else { ctx.moveTo(X(c.pr[i]), Y(c.sigma[i])); on = true; }
          }
          ctx.stroke();
        }
      }
    }
    // Hill boundary for this mass and phase
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 3]); ctx.beginPath();
    for (let j = 0; j <= 20; j++) {
      const e = r.e1[0] + ((r.e1[1] - r.e1[0]) * j) / 20, p = ov.hillPeriodRatio(eps, { e1: e, M1: maps.M1[k] });
      if (j === 0) ctx.moveTo(X(p), Y(e)); else ctx.lineTo(X(p), Y(e));
    }
    ctx.stroke(); ctx.setLineDash([]);
    for (const [pt, style] of [[marker, 'marker'], [cursor, 'cursor']]) {
      if (!pt || pt.eps !== eps || pt.k !== k) continue;
      const x = X(pt.pr), y = Y(pt.e1);
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
      if (style === 'marker') {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, 2 * Math.PI); ctx.stroke();
      } else if (document.activeElement === canvas) {
        ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
      }
    }
    ctx.restore();
    // Axes
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COLORS.text; ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(L, T, pw, ph);
    ctx.textAlign = 'center';
    for (const p of ticks(r.pr[0], r.pr[1], Math.max(3, Math.round(pw / 90)))) ctx.fillText(String(p), X(p), T + ph + 15);
    ctx.fillText('initial period ratio P₂/P₁', L + pw / 2, h - 5);
    ctx.textAlign = 'right';
    for (const e of ticks(r.e1[0], r.e1[1], Math.max(2, Math.round(ph / 45)))) ctx.fillText(String(e), L - 6, Y(e) + 4);
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('e₁', 0, 0); ctx.restore();
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };

  // --- reading the map
  function at(clientX, clientY) {
    if (!layout) return null;
    const box = canvas.getBoundingClientRect(), { L, T, pw, ph, r } = layout;
    const fx = (clientX - box.left - L) / pw, fy = 1 - (clientY - box.top - T) / ph;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const { eps, k } = state();
    return { eps, k, pr: r.pr[0] + fx * (r.pr[1] - r.pr[0]), e1: r.e1[0] + fy * (r.e1[1] - r.e1[0]) };
  }
  function valueAt(pt) {
    const { r, map } = current();
    if (!map) return null;
    const i = Math.round(((pt.pr - r.pr[0]) / (r.pr[1] - r.pr[0])) * (map.nx - 1));
    const j = Math.round(((pt.e1 - r.e1[0]) / (r.e1[1] - r.e1[0])) * (map.ny - 1));
    return map.values[j * map.nx + i];
  }
  const describe = (v) => v === -Infinity ? 'the planets scattered (plotted black)'
    : v === Infinity ? 'no divergence at all (plotted yellow)'
      : `Lyapunov time about ${fmt(10 ** v)} inner orbits (log₁₀ = ${v.toFixed(2)})`;
  function showHover(pt) {
    if (!pt) { hover.textContent = 'Point at the map to read it; select a point to integrate that orbit.'; return; }
    const v = valueAt(pt), src = state().src === 'notebook' ? 'notebook' : 'your browser';
    hover.textContent = `P₂/P₁ = ${pt.pr.toFixed(4)}, e₁ = ${pt.e1.toFixed(4)}` +
      (v === null || v === undefined || Number.isNaN(v) ? '' : `: ${describe(v)} (${src}).`);
  }
  canvas.addEventListener('mousemove', (e) => showHover(at(e.clientX, e.clientY)));
  canvas.addEventListener('mouseleave', () => showHover(null));
  canvas.addEventListener('click', (e) => {
    const pt = at(e.clientX, e.clientY);
    if (pt) { cursor = pt; selectPoint(pt); }
  });
  canvas.addEventListener('focus', () => {
    if (!cursor || cursor.eps !== state().eps) {
      const { r } = current(), { eps, k } = state();
      cursor = { eps, k, pr: (r.pr[0] + r.pr[1]) / 2, e1: (r.e1[0] + r.e1[1]) / 2 };
    }
    showHover(cursor); redraw();
  });
  canvas.addEventListener('blur', redraw);
  canvas.addEventListener('keydown', (e) => {
    if (!cursor) return;
    const { r } = current(), f = e.shiftKey ? 0.1 : 0.01;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (move) {
      e.preventDefault();
      cursor = { ...cursor, ...state(),
        pr: Math.min(r.pr[1], Math.max(r.pr[0], cursor.pr + move[0] * f * (r.pr[1] - r.pr[0]))),
        e1: Math.min(r.e1[1], Math.max(r.e1[0], cursor.e1 + move[1] * f * (r.e1[1] - r.e1[0]))) };
      showHover(cursor); redraw();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); selectPoint(cursor);
    }
  });

  function onSelectionChange() {
    stopPool();
    const { eps } = state();
    const nbRadio = srcRadios.find((r) => r.value === 'notebook');
    nbRadio.closest('label').classList.toggle('is-unavailable', !isNotebookEps(eps));
    computeBtn.textContent = 'Compute this map in your browser';
    showHover(null); redraw();
  }
  [epsSel, resSel].forEach((el) => el.addEventListener('change', onSelectionChange));
  m1Radios.forEach((el) => el.addEventListener('change', onSelectionChange));
  srcRadios.forEach((el) => el.addEventListener('change', redraw));
  sepBox.addEventListener('change', redraw);
  new ResizeObserver(redraw).observe(canvas.parentElement);
  onSelectionChange();

  // --- computing a map in the browser
  const nThreads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  function stopPool() {
    if (!pool) return;
    pool.workers.forEach((wk) => wk.terminate());
    const done = pool.done, total = pool.total;
    pool = null;
    progress.textContent = `Stopped after ${fmt(done)} of ${fmt(total)} orbits. Press the button again to continue.`;
  }
  computeBtn.addEventListener('click', () => {
    if (pool) { stopPool(); computeBtn.textContent = 'Continue computing this map'; return; }
    const { eps, k } = state(), res = resSel.value, [nx, ny] = res.split('x').map(Number), r = range(eps);
    const key = browserKey(eps, k, res);
    let map = browserMaps.get(key);
    if (!map) { map = { nx, ny, values: new Float32Array(nx * ny).fill(NaN) }; browserMaps.set(key, map); }
    srcRadios.forEach((x) => { x.checked = x.value === 'browser'; });
    // Pixels still to do, in a scattered order so the picture fills in evenly
    const todo = [];
    for (let i = 0; i < nx * ny; i++) if (Number.isNaN(map.values[i])) todo.push(i);
    let seed = 12345;
    for (let i = todo.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const j = seed % (i + 1); [todo[i], todo[j]] = [todo[j], todo[i]];
    }
    const job = (i) => {
      const ix = i % nx, iy = Math.floor(i / nx);
      return { i, eps, pr: r.pr[0] + ((r.pr[1] - r.pr[0]) * ix) / (nx - 1), e1: r.e1[0] + ((r.e1[1] - r.e1[0]) * iy) / (ny - 1), M1: maps.M1[k], tDays: maps.tDays };
    };
    const total = nx * ny, already = total - todo.length, t0 = performance.now();
    let next = 0;
    pool = { workers: [], done: already, total };
    const me = pool;
    computeBtn.textContent = 'Stop';
    const report = () => {
      const secs = (performance.now() - t0) / 1000, made = me.done - already;
      if (me.done >= total) {
        progress.textContent = `Computed ${fmt(total)} orbits${already ? '' : ` in ${clock(secs)}`}, on ${nThreads} thread${nThreads > 1 ? 's' : ''}.`;
        return;
      }
      const left = made > nThreads ? ` · about ${clock((secs / made) * (total - me.done))} to go` : '';
      progress.textContent = `Integrated ${fmt(me.done)} of ${fmt(total)} orbits · ${clock(secs)}${left}`;
    };
    const feed = (wk) => {
      if (next >= todo.length) { wk.terminate(); return; }
      const batch = todo.slice(next, next + 4).map(job);
      next += batch.length;
      wk.postMessage({ type: 'pixels', jobs: batch });
    };
    for (let t = 0; t < nThreads; t++) {
      const wk = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      wk.onmessage = ({ data }) => {
        if (pool !== me) return;
        for (const [i, v] of data.results) map.values[i] = v;
        me.done += data.results.length;
        report(); redraw();
        if (me.done >= total) { pool = null; computeBtn.textContent = 'Compute this map in your browser'; me.workers.forEach((x) => x.terminate()); }
        else feed(wk);
      };
      wk.onerror = () => { progress.textContent = 'Sorry, the integration could not run in this browser.'; stopPool(); };
      me.workers.push(wk);
      feed(wk);
    }
    report(); redraw();
  });
  function clock(s) {
    if (s < 60) return `${Math.max(1, Math.round(s))} s`;
    const m = Math.floor(s / 60), r = Math.round(s % 60);
    return `${m} min${r ? ` ${r} s` : ''}`;
  }

  // --- one orbit
  let orbitWorker = null, orbitId = 0, lastRun = null;
  function selectPoint(pt) {
    inputs.eps.value = String(pt.eps);
    inputs.pr.value = pt.pr.toFixed(4);
    inputs.e1.value = pt.e1.toFixed(4);
    inputs.m1.value = String(Math.round((maps.M1[pt.k] * 180) / Math.PI));
    inputs.len.value = 'dph13';
    run({ fromMap: pt });
  }
  function run({ fromMap = null } = {}) {
    const eps = Number(inputs.eps.value), pr = Number(inputs.pr.value), e1 = Number(inputs.e1.value);
    const M1 = (Number(inputs.m1.value) * Math.PI) / 180;
    if (!(eps > 0 && eps <= 0.01) || !(pr > 1.001 && pr <= 3) || !(e1 >= 0 && e1 < 0.6) || !Number.isFinite(M1)) {
      verdict.textContent = 'Please choose 0 < ε ≤ 0.01, 1.001 < P₂/P₁ ≤ 3 and 0 ≤ e₁ < 0.6.';
      return;
    }
    const long = inputs.len.value === '1e5';
    const tDays = long ? (1e5 / pr) * 365.25 : 1e6;
    if (orbitWorker) orbitWorker.terminate();
    orbitWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const id = ++orbitId;
    const k = maps.M1.findIndex((m) => Math.abs(m - M1) < 0.01);
    marker = fromMap || { eps, k, pr, e1 };
    redraw();
    runBtn.disabled = true;
    verdict.textContent = 'Integrating…';
    orbitWorker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === 'progress') { verdict.textContent = `Integrating… ${Math.round(100 * data.f)}%`; return; }
      runBtn.disabled = false;
      lastRun = { ...data, eps, pr, e1, M1, k, tDays };
      plotOrbit(); explain(lastRun);
      orbitWorker.terminate(); orbitWorker = null;
    };
    orbitWorker.postMessage({ type: 'orbit', id, params: { eps, pr, e1, M1, tDays } });
  }
  runBtn.addEventListener('click', () => run());
  document.querySelectorAll('[data-orbit]').forEach((b) => b.addEventListener('click', () => {
    const [eps, delta] = b.dataset.orbit.split(',').map(Number);
    inputs.eps.value = String(eps); inputs.pr.value = ((1 + delta) ** 1.5).toFixed(4);
    inputs.e1.value = '0'; inputs.m1.value = '90'; inputs.len.value = '1e5';
    $('ro-orbit').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    run();
  }));

  function explain(r) {
    const s = r.samples, last = s[s.length - 1], lnD = last.lnD;
    const orbits = (r.pr * r.tDays) / ov.DAYS_PER_YEAR;
    let text;
    if (r.logT === -Infinity) {
      text = `Strongly chaotic: the planets scattered after about ${fmt(last.t)} inner orbits, so the run stopped.`;
    } else {
      const growth = lnD / Math.LN10;
      const g = growth < 3 ? `a factor of ${fmt(Math.exp(lnD), 0)}` : `a factor of about 10${sup(Math.round(growth))}`;
      const kind = lnD > LND_CHAOTIC ? 'Chaotic.' : lnD < LND_REGULAR ? 'Regular on this time-scale.' : 'Borderline: weakly chaotic, or regular; a longer run would tell.';
      text = `${kind} Over ${fmt(orbits)} inner orbits a neighbouring orbit diverged by ${g}. ` +
        (lnD < LND_REGULAR
          ? `That slow growth is what regular orbits show; the Lyapunov time it implies, about ${fmt(10 ** r.logT)} orbits, is only a lower limit set by the run’s length.`
          : `Lyapunov time about ${fmt(10 ** r.logT, 10 ** r.logT < 10 ? 1 : 0)} inner orbits (log₁₀ = ${r.logT.toFixed(2)}).`);
      const prs = s.map((p) => p.pr).filter(Number.isFinite);
      text += ` The period ratio ranged from ${Math.min(...prs).toFixed(3)} to ${Math.max(...prs).toFixed(3)}.`;
      if (r.k >= 0 && isNotebookEps(r.eps) && r.tDays === maps.tDays && notebook) {
        const nb = maps.pr, ne = maps.e1;
        const i = Math.round(((r.pr - nb[0]) / (nb[1] - nb[0])) * (nb[2] - 1)), j = Math.round(((r.e1 - ne[0]) / (ne[1] - ne[0])) * (ne[2] - 1));
        if (i >= 0 && i < nb[2] && j >= 0 && j < ne[2]) {
          const v = notebook[r.k * nb[2] * ne[2] + j * nb[2] + i];
          text += ` The notebook’s nearest pixel: ${describe(v)}.`;
        }
      }
    }
    verdict.textContent = text;
  }

  function plotOrbit() {
    if (!lastRun) return;
    const s = lastRun.samples;
    linePlot($('ro-plot-lnd'), s.map((p) => p.t), s.map((p) => p.lnD), { ylabel: 'ln d', floor0: true });
    linePlot($('ro-plot-pr'), s.map((p) => p.t), s.map((p) => p.pr), { ylabel: 'P₂/P₁', resonances: true });
  }
  [$('ro-plot-lnd'), $('ro-plot-pr')].forEach((c) => new ResizeObserver(plotOrbit).observe(c.parentElement));
}

function linePlot(canvas, xs, ys, { ylabel, floor0 = false, resonances = false }) {
  const { ctx, w, h } = fit(canvas);
  const L = 48, R = 18, T = 10, B = 34, pw = w - L - R, ph = h - T - B;
  const ok = ys.filter(Number.isFinite);
  let lo = Math.min(...ok), hi = Math.max(...ok);
  if (floor0) lo = Math.min(0, lo);
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.08;
  lo -= floor0 ? 0 : pad; hi += pad;
  const x0 = 0, x1 = xs[xs.length - 1] || 1;
  const X = (x) => L + ((x - x0) / (x1 - x0)) * pw, Y = (y) => T + ph - ((y - lo) / (hi - lo)) * ph;
  ctx.font = '11px system-ui, sans-serif';
  const yt = ticks(lo, hi, 4), xt = ticks(x0, x1, Math.max(3, Math.round(pw / 80)));
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (const v of yt) { ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); }
  ctx.stroke();
  if (resonances) {
    // First-order resonances in range, as in the notebook's Figure 14 analogue
    ctx.strokeStyle = 'rgba(150,150,150,0.45)'; ctx.fillStyle = COLORS.text; ctx.textAlign = 'right';
    for (let m = 1; m < 200; m++) {
      const p = (m + 1) / m;
      if (p < lo || p > hi) continue;
      ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(L + pw, Y(p)); ctx.stroke();
    }
  }
  ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1.4; ctx.beginPath();
  let on = false;
  xs.forEach((x, i) => {
    if (!Number.isFinite(ys[i])) { on = false; return; }
    if (on) ctx.lineTo(X(x), Y(ys[i])); else { ctx.moveTo(X(x), Y(ys[i])); on = true; }
  });
  ctx.stroke();
  ctx.strokeStyle = COLORS.axis; ctx.strokeRect(L, T, pw, ph);
  ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
  const kfmt = (v) => (x1 >= 1e4 ? `${fmt(v / 1000)}k` : fmt(v));
  for (const v of xt) ctx.fillText(kfmt(v), X(v), T + ph + 14);
  ctx.fillText('time (inner orbits)', L + pw / 2, h - 4);
  ctx.textAlign = 'right';
  const dec = Math.max(0, -Math.floor(Math.log10(niceStep(hi - lo, 4)) + 1e-9));
  for (const v of yt) ctx.fillText(v.toFixed(dec), L - 5, Y(v) + 4);
  ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
  ctx.fillText(ylabel, 0, 0); ctx.restore();
}
