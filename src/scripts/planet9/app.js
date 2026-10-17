// Interactive page on Planet Nine and the secular dynamics of distant TNOs (after Li,
// Hadden, Payne & Holman 2018): (1) one TNO's secular evolution, integrated in a worker
// on request; (2) the notebook's ensemble of anti-aligned TNOs; (3) the notebook's map
// of which orbits flip. Nothing runs on its own; the notebook's data load when section 2
// is near.
import * as P from './physics.js';
import { COLORS, fit, frame, dot, fmt, sig } from '../plotting.js';

const D = Math.PI / 180;
const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const VIR = VIRIDIS.map(rgb);
function viridis(t) {
  t = Math.max(0, Math.min(1, t)) * (VIR.length - 1);
  const i = Math.min(Math.floor(t), VIR.length - 2), f = t - i;
  const c = VIR[i].map((v, k) => Math.round(v + f * (VIR[i + 1][k] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const incColour = (iDeg) => viridis(iDeg / 180);
const wrap360 = (x) => ((x % 360) + 360) % 360;

const PRESETS = {
  paper: { a: 368.75, rp: 368.75 * (1 - 0.867), i: 10, dvarpi: 180, w: 0, label: 'The paper’s example' },
  circ: { a: 170, rp: 40, i: 10, dvarpi: 180, w: 60, label: 'a = 170 au' },
  flip: { a: 480, rp: 45, i: 10, dvarpi: 180, w: 150, label: 'a = 480 au' },
  aligned: { a: 368.75, rp: 49, i: 10, dvarpi: 0, w: 0, label: 'Aligned with Planet Nine' }
};

export function startPlanet9(base) {
  const $ = (id) => document.getElementById(id);
  const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

  // ============================ 1. One TNO ===========================================
  const inp = { a: $('p9-a'), rp: $('p9-rp'), i: $('p9-i'), dv: $('p9-dv'), w: $('p9-w'), m9: $('p9-m9'), a9: $('p9-a9'), e9: $('p9-e9'), t: $('p9-t') };
  const out = { a: $('p9-a-out'), rp: $('p9-rp-out'), i: $('p9-i-out'), dv: $('p9-dv-out'), w: $('p9-w-out'), m9: $('p9-m9-out'), a9: $('p9-a9-out'), e9: $('p9-e9-out'), t: $('p9-t-out') };
  const j2Box = $('p9-j2'), runBtn = $('p9-run'), status = $('p9-status');
  const trajCanvas = $('p9-traj'), incCanvas = $('p9-inc'), peCanvas = $('p9-peri');
  let track = [], worker = null, runId = 0, tEnd = 4e9;

  function showValues() {
    if (Number(inp.rp.value) > Number(inp.a.value) * 0.95) inp.rp.value = String(Math.round(Number(inp.a.value) * 0.95));
    out.a.textContent = `${inp.a.value} au`;
    out.rp.textContent = `${inp.rp.value} au (e = ${(1 - Number(inp.rp.value) / Number(inp.a.value)).toFixed(3)})`;
    out.i.textContent = `${inp.i.value}°`;
    out.dv.textContent = `${inp.dv.value}°${Number(inp.dv.value) === 180 ? ' (anti-aligned)' : Number(inp.dv.value) === 0 ? ' (aligned)' : ''}`;
    out.w.textContent = `${inp.w.value}°`;
    out.m9.textContent = `${inp.m9.value} Earth masses`;
    out.a9.textContent = `${inp.a9.value} au`;
    out.e9.textContent = `${Number(inp.e9.value).toFixed(2)} (pericentre ${Math.round(Number(inp.a9.value) * (1 - Number(inp.e9.value)))} au)`;
    out.t.textContent = `${(Number(inp.t.value) / 1e9).toFixed(1)} billion years`;
  }
  Object.values(inp).forEach((el) => el.addEventListener('input', showValues));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    inp.a.value = String(p.a); inp.rp.value = String(Math.round(p.rp * 10) / 10); inp.i.value = String(p.i); inp.dv.value = String(p.dvarpi); inp.w.value = String(p.w);
    inp.m9.value = '10'; inp.a9.value = '500'; inp.e9.value = '0.6'; j2Box.checked = true;
    showValues(); run();
  }));

  function drawTraj() {
    const { ctx, w, h } = fit(trajCanvas);
    const f = frame(ctx, w, h, { x0: 0, x1: 360, y0: 10, y1: 1000, ylog: true, xticks: [0, 90, 180, 270, 360], xlabel: 'longitude of pericentre relative to Planet Nine, Δϖ (degrees)', ylabel: 'pericentre distance (au)' });
    f.clip();
    ctx.fillStyle = 'rgba(7,141,151,0.07)'; ctx.fillRect(f.L, f.Y(80), f.pw, f.Y(30) - f.Y(80));
    for (const p of track) dot(ctx, f.X(p.dv), f.Y(Math.max(10, Math.min(1000, p.rp))), 1.8, incColour(p.i));
    if (track.length) { const p = track[0]; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.X(p.dv), f.Y(p.rp), 5, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('shaded: 30–80 au, where such TNOs can be seen; circle: start', f.L + 6, f.T + 4);
  }
  function drawTime(canvas, key, opts) {
    const { ctx, w, h } = fit(canvas);
    const f = frame(ctx, w, h, { x0: 0, x1: tEnd / 1e9, xlabel: 'time (billion years)', ...opts });
    f.clip();
    ctx.lineWidth = 1.6; ctx.strokeStyle = COLORS.teal; ctx.beginPath();
    track.forEach((p, k) => { const x = f.X(p.t / 1e9), y = f.Y(Math.max(opts.y0, Math.min(opts.y1, p[key]))); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    if (key === 'i') { ctx.strokeStyle = COLORS.red; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(f.L, f.Y(90)); ctx.lineTo(f.L + f.pw, f.Y(90)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }
  function drawAll() {
    drawTraj();
    drawTime(incCanvas, 'i', { y0: 0, y1: 180, yticks: [0, 45, 90, 135, 180], ylabel: 'inclination (°)' });
    drawTime(peCanvas, 'rp', { y0: 10, y1: 1000, ylog: true, ylabel: 'pericentre (au)' });
  }

  function run() {
    if (worker) worker.terminate();
    const a = Number(inp.a.value), rp = Number(inp.rp.value), e = 1 - rp / a;
    const w = Number(inp.w.value) * D, O = (Number(inp.dv.value) - Number(inp.w.value)) * D;
    tEnd = Number(inp.t.value);
    const p9 = { m9: Number(inp.m9.value) * P.M_EARTH, a9: Number(inp.a9.value), e9: Number(inp.e9.value), j2: j2Box.checked };
    track = []; drawAll();
    const id = ++runId, t0 = performance.now();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    runBtn.disabled = true;
    status.textContent = 'Evolving…';
    let flippedAt = null, last = 0;
    worker.onmessage = ({ data: m }) => {
      if (m.id !== id) return;
      if (m.type === 'out') {
        const p = { t: m.t, i: m.el.i / D, rp: a * (1 - m.el.e), dv: wrap360((m.el.varpi - m.varpi9) / D), e: m.el.e };
        track.push(p);
        if (flippedAt == null && p.i > 90) flippedAt = p.t;
        if (performance.now() - last > 120) { last = performance.now(); drawAll(); }
      } else if (m.type === 'progress') {
        status.textContent = `Evolving: ${(m.f * tEnd / 1e9).toFixed(2)} of ${(tEnd / 1e9).toFixed(1)} billion years…`;
      } else if (m.type === 'done') {
        drawAll(); runBtn.disabled = false; worker.terminate(); worker = null;
        const dvs = track.map((p) => p.dv);
        const libr = Math.max(...dvs) - Math.min(...dvs) < 300 && track.every((p) => p.i < 90);
        const iMax = Math.max(...track.map((p) => p.i)), rMin = Math.min(...track.map((p) => p.rp));
        status.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. `
          + (flippedAt != null ? `The orbit flipped past 90° after ${(flippedAt / 1e9).toFixed(2)} billion years. ` : `Highest inclination ${iMax.toFixed(0)}°. `)
          + (libr ? `Δϖ stayed between ${Math.min(...dvs).toFixed(0)}° and ${Math.max(...dvs).toFixed(0)}°: it librates. ` : 'Δϖ circulated or wandered. ')
          + (m.stopped
            ? `Stopped after ${(m.tStop / 1e9).toFixed(2)} billion years, when its pericentre fell below 10 au: the giant planets would scatter it, which this secular model cannot follow.`
            : `Smallest pericentre ${rMin.toFixed(0)} au.`
              + (rMin < 30 ? ' (Below about 30 au, Neptune would scatter it; this secular model does not include that.)' : ''));
      }
    };
    worker.onerror = () => { status.textContent = 'The integration failed in this browser.'; runBtn.disabled = false; };
    worker.postMessage({ id, a, el: { e, i: Number(inp.i.value) * D, w, O }, p9, tEnd, nOut: 1500 });
  }
  runBtn.addEventListener('click', run);

  // ============================ 2 and 3. The notebook's results =======================
  const ensCanvas = $('p9-ens'), histCanvas = $('p9-hist'), flipCanvas = $('p9-flip'), dataStatus = $('p9-data-status');
  let data = null, loading = false;
  async function load() {
    if (data || loading) return;
    loading = true; dataStatus.textContent = 'Loading the notebook’s results…';
    try {
      const r = await fetch(`${base}data/planet9/secular.json`);
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      dataStatus.textContent = `${data.ensemble.n} TNOs, each followed for 4 billion years in the notebook; ${data.ensemble.n_flipped} flipped past 90°.`;
      drawEnsemble(); drawFlip();
    } catch (e) { dataStatus.textContent = 'The notebook’s results could not be loaded. Try reloading the page.'; loading = false; }
  }
  new IntersectionObserver((es, obs) => { if (es.some((x) => x.isIntersecting)) { load(); obs.disconnect(); } }, { rootMargin: '400px' }).observe($('p9-ensemble'));

  const BINS = { low: [0, 40], high: [60, 120], retro: [140, 180], all: [0, 180] };
  function drawEnsemble() {
    if (!data) return;
    const [lo, hi] = BINS[radio('p9-bin')];
    const pts = data.ensemble.points.filter((p) => p[3] >= lo && p[3] < hi);
    {
      const { ctx, w, h } = fit(ensCanvas);
      const f = frame(ctx, w, h, { x0: 150, x1: 600, y0: 0, y1: 360, yticks: [0, 90, 180, 270, 360], xlabel: 'semi-major axis (au)', ylabel: 'Δθe (degrees)' });
      f.clip();
      for (const p of pts) dot(ctx, f.X(p[0]), f.Y(p[1]), 1.4, incColour(p[3]));
      ctx.restore();
    }
    {
      const { ctx, w, h } = fit(histCanvas);
      const nb = 18, hist = new Array(nb).fill(0);
      for (const p of pts) hist[Math.min(nb - 1, Math.floor(p[1] / 360 * nb))] += 1;
      const tot = pts.length || 1, ymax = Math.max(...hist) / tot * 1.15 || 0.1;
      const f = frame(ctx, w, h, { x0: 0, x1: 360, y0: 0, y1: ymax, xticks: [0, 90, 180, 270, 360], xlabel: 'Δθe (degrees)', ylabel: 'fraction', yfmt: (v) => `${(100 * v).toFixed(0)}%` });
      ctx.fillStyle = 'rgba(7,141,151,0.55)';
      hist.forEach((c, k) => { const x0 = f.X(k * 360 / nb), x1 = f.X((k + 1) * 360 / nb); ctx.fillRect(x0 + 1, f.Y(c / tot), x1 - x0 - 2, f.Y(0) - f.Y(c / tot)); });
      ctx.strokeStyle = COLORS.red; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(f.L, f.Y(1 / nb)); ctx.lineTo(f.L + f.pw, f.Y(1 / nb)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${fmt(pts.length)} snapshots; dashed: no clustering`, f.L + 6, f.T + 4);
    }
  }
  document.querySelectorAll('input[name="p9-bin"]').forEach((el) => el.addEventListener('change', drawEnsemble));

  function drawFlip() {
    if (!data || !data.flipmap) return;
    const fm = data.flipmap, withJ2 = radio('p9-flipj2') === 'on';
    const grid = withJ2 ? fm.flip_j2 : fm.flip_noj2;
    const { ctx, w, h } = fit(flipCanvas);
    const da = (fm.a[1] - fm.a[0]) / 2, dr = (Math.log10(fm.rp[1]) - Math.log10(fm.rp[0])) / 2;
    const f = frame(ctx, w, h, { x0: fm.a[0] - da, x1: fm.a[fm.a.length - 1] + da, y0: 10 ** (Math.log10(fm.rp[0]) - dr), y1: 10 ** (Math.log10(fm.rp[fm.rp.length - 1]) + dr), ylog: true, xlabel: 'semi-major axis (au)', ylabel: 'starting pericentre (au)' });
    fm.a.forEach((a, ia) => fm.rp.forEach((rp, ir) => {
      const v = grid[ia][ir];
      if (v == null) return;
      ctx.fillStyle = v ? '#c4160c' : '#d9e6ea';
      const x0 = f.X(a - da), x1 = f.X(a + da), y0 = f.Y(10 ** (Math.log10(rp) + dr)), y1 = f.Y(10 ** (Math.log10(rp) - dr));
      ctx.fillRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    }));
    ctx.strokeStyle = COLORS.ink; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(f.L, f.Y(80)); ctx.lineTo(f.L + f.pw, f.Y(80)); ctx.stroke(); ctx.setLineDash([]);
  }
  document.querySelectorAll('input[name="p9-flipj2"]').forEach((el) => el.addEventListener('change', drawFlip));

  // ============================ start ===============================================
  showValues(); drawAll();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { drawAll(); drawEnsemble(); drawFlip(); }); });
}
