// Interactive TTV page: (1) one system integrated on request in a worker, with
// the option of comparing four inclinations; (2) the notebook's maps, which can
// be explored and clicked to integrate a system; (3) the fraction of systems
// above a detection threshold, against inclination. Nothing runs on its own;
// the map data load when section 2 is near.
import * as tv from './physics.js';
import { COLORS, fit, frame, dot, fmt, sig, logLabel } from '../plotting.js';

const DEG = Math.PI / 180;
// PFV10's colour key (RMS TTV, seconds), viridis as in the notebook
const BINS = [0, 1, 3, 10, 30, 100, 300, 1000, Infinity];
const BIN_LABELS = ['0–1', '1–3', '3–10', '10–30', '30–100', '100–300', '300–1000', '1000+'];
const BIN_COLORS = ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'];
const NONE = '#d9d9d9';
const binColour = (v) => (v == null ? NONE : BIN_COLORS[BINS.findIndex((b, k) => v >= b && v < BINS[k + 1])]);
const INC_STYLE = { 0: ['#d62728', []], 45: ['#2ca02c', [2, 3]], 90: ['#1f77b4', [7, 4]], 180: ['#111111', [8, 3, 2, 3]] };
const PRESETS = [
  { label: '(a) 2:1 resonance', aRatio: 1.59, e2: 0.02 },
  { label: '(b) 3:1 resonance', aRatio: 2.08, e2: 0.12 },
  { label: '(c) 5:1 resonance', aRatio: 2.92, e2: 0.05 },
  { label: '(d) next to 2:1', aRatio: 1.63, e2: 0.05 },
  { label: '(e) non-resonant', aRatio: 3.6, e2: 0.15 },
  { label: '(f) non-resonant, eccentric', aRatio: 3.6, e2: 0.55 }
];

export function startTTV(base) {
  const $ = (id) => document.getElementById(id);

  // ============================ 1. One system =======================================
  const inp = { pr: $('tt-pr'), e2: $('tt-e2'), i2: $('tt-i2'), w: $('tt-omega'), O: $('tt-Omega'), M: $('tt-M'), mass: $('tt-mass') };
  const out = { pr: $('tt-pr-out'), e2: $('tt-e2-out'), i2: $('tt-i2-out'), w: $('tt-omega-out'), O: $('tt-Omega-out'), M: $('tt-M-out') };
  const compare = $('tt-compare'), runBtn = $('tt-run'), status = $('tt-status'), plot = $('tt-plot');
  let worker = null, runId = 0, lastRuns = null;

  const params = () => ({
    aRatio: Number(inp.pr.value) ** (2 / 3), e2: Number(inp.e2.value), inc2: Number(inp.i2.value) * DEG,
    omega2: Number(inp.w.value) * DEG, Omega2: Number(inp.O.value) * DEG, M2: Number(inp.M.value) * DEG,
    m2: Number(inp.mass.value) * tv.M_EARTH
  });
  function showValues() {
    const p = params();
    out.pr.textContent = `P₂/P₁ = ${Number(inp.pr.value).toFixed(3)}  (a₂/a₁ = ${p.aRatio.toFixed(3)})`;
    out.e2.textContent = `e₂ = ${Number(inp.e2.value).toFixed(3)}`;
    out.i2.textContent = `i₂ = ${inp.i2.value}°${Number(inp.i2.value) > 90 ? ' (retrograde)' : Number(inp.i2.value) === 90 ? ' (polar)' : ''}`;
    out.w.textContent = `ω = ${inp.w.value}°`; out.O.textContent = `Ω = ${inp.O.value}°`; out.M.textContent = `M = ${inp.M.value}°`;
    const stable = tv.gladmanHillStable(p.aRatio, p.e2, { m2: p.m2 });
    $('tt-hill').textContent = stable ? '' : 'Not Hill stable for coplanar orbits (Gladman 1993): the notebook and the paper did not simulate this region, and close encounters can make the orbit change unpredictably.';
    $('tt-hill').hidden = stable;
  }
  Object.values(inp).forEach((el) => el.addEventListener('input', showValues));
  compare.addEventListener('change', () => { $('tt-i2').disabled = compare.checked; });

  function setSystem({ aRatio, e2, inc, angles }) {
    inp.pr.value = String((aRatio ** 1.5).toFixed(3));
    inp.e2.value = String(e2);
    if (inc != null) inp.i2.value = String(inc);
    if (angles) [inp.w.value, inp.O.value, inp.M.value] = angles.map(String);
    showValues();
  }
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = PRESETS[Number(b.dataset.preset)];
    setSystem({ aRatio: p.aRatio, e2: p.e2, angles: [0, 0, 0] });
    compare.checked = true; $('tt-i2').disabled = true;
    run();
  }));
  $('tt-random').addEventListener('click', () => {
    setSystem({ aRatio: params().aRatio, e2: Number(inp.e2.value), angles: [0, 0, 0].map(() => Math.floor(Math.random() * 360)) });
  });

  function run() {
    if (worker) worker.terminate();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const id = ++runId, p = params();
    const incs = compare.checked ? [0, 45, 90, 180] : [Number(inp.i2.value)];
    const systems = incs.map((i) => ({ ...p, inc2: i * DEG }));
    runBtn.disabled = true;
    status.textContent = 'Integrating…';
    worker.onerror = () => { runBtn.disabled = false; status.textContent = 'The integration failed to run in this browser. Please reload the page to try again.'; };
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === 'progress') { status.textContent = `Integrating… ${Math.round(100 * data.f)}%`; return; }
      runBtn.disabled = false;
      worker.terminate(); worker = null;
      lastRuns = data.runs.map((r, k) => ({ ...r, inc: incs[k] }));
      const parts = lastRuns.map((r) => `${r.inc}°: ${sig(r.rms)} s`);
      status.textContent = `${lastRuns[0].times.length} transits over 10 years, in ${fmt(data.ms / 1000, 2)} s. RMS TTV ${parts.join(', ')}.`;
      drawPlot();
    };
    worker.postMessage({ id, systems });
  }
  runBtn.addEventListener('click', run);

  function drawPlot() {
    const { ctx, w, h } = fit(plot);
    if (!lastRuns) {
      frame(ctx, w, h, { x0: 0, x1: 10, y0: -1, y1: 1, xlabel: 'time (years)', ylabel: 'TTV (s)' });
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const r of lastRuns) for (const v of r.resid) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = 0.08 * (hi - lo || 1);
    const f = frame(ctx, w, h, { x0: 0, x1: 10, y0: lo - pad, y1: hi + pad, xlabel: 'time (years)', ylabel: 'TTV (s)', left: 58 });
    f.clip();
    for (const r of lastRuns) {
      const [col, dash] = INC_STYLE[r.inc] || [COLORS.teal, []];
      ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.4; ctx.beginPath();
      r.times.forEach((t, i) => { const x = f.X(t / tv.YEAR_D), y = f.Y(r.resid[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
    // key
    ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    lastRuns.forEach((r, k) => {
      const [col, dash] = INC_STYLE[r.inc] || [COLORS.teal, []];
      const x = f.L + 10, y = f.T + 12 + 16 * k;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 4, y - 7, 150, 15);
      ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.ink; ctx.fillText(`i₂ = ${r.inc}°: RMS ${sig(r.rms)} s`, x + 32, y);
    });
    plot.setAttribute('aria-label', `Transit timing variations over 10 years. ${lastRuns.map((r) => `Inclination ${r.inc} degrees: RMS ${sig(r.rms)} seconds`).join('. ')}.`);
  }
  showValues(); drawPlot();

  // =============================== 2. Maps ==========================================
  let maps = null;
  const mapCanvas = $('tt-map'), hover = $('tt-map-hover');
  const view = () => [...document.getElementsByName('tt-view')].find((r) => r.checked).value;
  const incSel = () => Number([...document.getElementsByName('tt-inc')].find((r) => r.checked).value);
  let mapFrame = null;

  async function loadMaps() {
    if (maps) return;
    try {
      maps = await fetch(`${base}data/ttv/maps.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      $('tt-map-status').hidden = true;
      drawMap(); drawFraction();
    } catch (e) {
      $('tt-map-status').textContent = 'The maps could not be loaded. Please reload the page to try again.';
    }
  }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadMaps(); } }, { rootMargin: '400px' });
  io.observe($('tt-maps'));

  // current map: {xs, ys, values, xlabel, inc, aFixed}
  function currentMap() {
    const v = view();
    if (v === 'eccinc') {
      const k = Number($('tt-a-select').value), m = maps.eccInc.maps[k];
      return { xs: maps.eccInc.i2, ys: maps.eccInc.e2, values: m.values, xlabel: 'companion’s relative inclination i₂ (°)', kind: 'eccinc', aRatio: m.aRatio };
    }
    const src = v === 'flames' ? maps.flames : maps.closeUp;
    const k = src.inc.indexOf(incSel());
    return { xs: src.aRatio, ys: src.e2, values: src.maps[k], xlabel: 'semi-major axis ratio a₂/a₁', kind: v, inc: incSel() };
  }
  function drawMap() {
    if (!maps) return;
    const m = currentMap();
    $('tt-inc-group').hidden = m.kind === 'eccinc';
    $('tt-a-group').hidden = m.kind !== 'eccinc';
    const { ctx, w, h } = fit(mapCanvas);
    const nx = m.xs.length, ny = m.ys.length;
    const dx = (m.xs[nx - 1] - m.xs[0]) / (nx - 1), dy = (m.ys[ny - 1] - m.ys[0]) / (ny - 1);
    const f = frame(ctx, w, h, { x0: m.xs[0] - dx / 2, x1: m.xs[nx - 1] + dx / 2, y0: m.ys[0] - dy / 2, y1: m.ys[ny - 1] + dy / 2,
      xlabel: m.xlabel, ylabel: 'companion’s eccentricity e₂', top: 22, xticks: m.kind === 'eccinc' ? [0, 45, 90, 135, 180] : 6 });
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = f.X(m.xs[i] - dx / 2), x1 = f.X(m.xs[i] + dx / 2), y0 = f.Y(m.ys[j] + dy / 2), y1 = f.Y(m.ys[j] - dy / 2);
        ctx.fillStyle = binColour(m.values[j * nx + i]);
        ctx.fillRect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1);
      }
    }
    if (m.kind !== 'eccinc') {   // resonance labels
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COLORS.text; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const res = m.kind === 'flames' ? [[2, 1], [5, 2], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]] : [[2, 1], [7, 4], [9, 5], [11, 6]];
      for (const [p, q] of res) {
        const a = (p / q) ** (2 / 3);
        if (a < m.xs[0] || a > m.xs[nx - 1]) continue;
        ctx.fillText(`${p}:${q}`, f.X(a), f.T - 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(f.X(a), f.T); ctx.lineTo(f.X(a), f.T + f.ph); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    mapFrame = { f, m, dx, dy, nx, ny };
    mapCanvas.setAttribute('aria-label', `Map of median RMS TTV, ${m.kind === 'eccinc' ? `against inclination and eccentricity at a₂/a₁ = ${m.aRatio}` : `against a₂/a₁ and eccentricity at inclination ${m.inc} degrees`}. Select a point to integrate that system.`);
  }
  function mapPoint(ev) {
    if (!mapFrame) return null;
    const { f, m, dx, dy, nx, ny } = mapFrame;
    const r = mapCanvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const vx = m.xs[0] - dx / 2 + ((x - f.L) / f.pw) * (nx * dx), vy = m.ys[0] - dy / 2 + ((f.T + f.ph - y) / f.ph) * (ny * dy);
    const i = Math.round((vx - m.xs[0]) / dx), j = Math.round((vy - m.ys[0]) / dy);
    if (i < 0 || i >= nx || j < 0 || j >= ny) return null;
    const value = m.values[j * nx + i];
    return m.kind === 'eccinc'
      ? { aRatio: m.aRatio, e2: m.ys[j], inc: m.xs[i], value }
      : { aRatio: m.xs[i], e2: m.ys[j], inc: m.inc, value };
  }
  mapCanvas.addEventListener('mousemove', (ev) => {
    const p = mapPoint(ev);
    if (!p) { hover.textContent = 'Point at the map to read it; select a point to integrate that system above.'; return; }
    hover.textContent = `a₂/a₁ = ${p.aRatio.toFixed(3)} (P₂/P₁ = ${(p.aRatio ** 1.5).toFixed(3)}), e₂ = ${p.e2.toFixed(3)}, i₂ = ${p.inc}°: `
      + (p.value == null ? 'not Hill stable, not simulated.' : `median RMS TTV ${sig(p.value)} s.`);
  });
  mapCanvas.addEventListener('click', (ev) => {
    const p = mapPoint(ev);
    if (!p || p.value == null) return;
    setSystem({ aRatio: p.aRatio, e2: p.e2, inc: p.inc, angles: [0, 0, 0].map(() => Math.floor(Math.random() * 360)) });
    compare.checked = false; $('tt-i2').disabled = false;
    $('tt-system').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    run();
  });
  document.querySelectorAll('[name="tt-view"], [name="tt-inc"]').forEach((r) => r.addEventListener('change', drawMap));
  $('tt-a-select').addEventListener('change', drawMap);

  // ========================= 3. Absence of evidence =================================
  const thr = $('tt-thr'), frac = $('tt-frac');
  const threshold = () => 10 ** Number(thr.value);
  function drawFraction() {
    $('tt-thr-out').textContent = `${sig(threshold())} s`;
    const { ctx, w, h } = fit(frac);
    const f = frame(ctx, w, h, { x0: 0, x1: 180, y0: 0, y1: 0.6, xticks: [0, 30, 45, 90, 135, 180], xlabel: 'companion’s relative inclination i₂ (°)',
      ylabel: 'fraction above the threshold', yfmt: (v) => `${Math.round(100 * v)}%` });
    if (!maps) return;
    const t = threshold();
    const pts = maps.flames.inc.map((inc, k) => {
      const v = maps.flames.maps[k].filter((x) => x != null);
      return [inc, v.filter((x) => x > t).length / v.length];
    });
    ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(f.X(x), f.Y(y)) : ctx.moveTo(f.X(x), f.Y(y))));
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COLORS.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const [x, y] of pts) { dot(ctx, f.X(x), f.Y(y), 4, COLORS.teal); ctx.fillStyle = COLORS.ink; ctx.fillText(`${Math.round(100 * y)}%`, f.X(x), f.Y(y) - 6); }
    $('tt-frac-read').textContent = `Coplanar (0°): ${Math.round(100 * pts[0][1])}% of the stable plane is above ${sig(t)} s. Polar (90°): ${Math.round(100 * pts[3][1])}%. Retrograde (180°): ${Math.round(100 * pts[5][1])}%.`;
    frac.setAttribute('aria-label', `Fraction of the stable plane with RMS TTV above ${sig(t)} seconds: ${pts.map(([x, y]) => `${x} degrees ${Math.round(100 * y)} percent`).join(', ')}.`);
  }
  thr.addEventListener('input', drawFraction);
  drawFraction();

  window.addEventListener('resize', () => { drawPlot(); drawMap(); drawFraction(); });
}
