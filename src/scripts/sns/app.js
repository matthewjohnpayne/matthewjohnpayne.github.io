// Interactive page on catalogue shift-and-stack (after Stetzler et al. 2025). A detection
// catalogue is simulated statistically: noise peaks at the surface densities measured in the
// notebook's simulated images, and moving objects detected with S25's probabilities and
// positional errors. The reader stacks it by hand along a trial velocity, then runs S25's search.
import { search, stack, fitLine } from './search.js';
import { COLORS, fit, frame, dot, fmt } from '../plotting.js';

const SIZE = 256, A = 2, N_EP = 30, T_SPAN = 4;
const TIMES = Array.from({ length: N_EP }, (_, i) => (i * T_SPAN) / (N_EP - 1));
// Noise peaks above each threshold per a^2, measured in the notebook (Section 2)
const NOISE = { 2: 8.77e-3, 2.5: 3.27e-3, 3: 9.19e-4, 3.5: 2.04e-4, 4: 4.14e-5 };
const VIR = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];

function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  const poisson = (lam) => { // Gaussian approximation is fine for the large means here
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * n()));
    let k = 0, p = Math.exp(-lam), s = p; const x = u(); while (x > s) { k += 1; p *= lam / k; s += p; } return k;
  };
  return { u, n, poisson };
}
const erfc = (x) => { // Numerical Recipes erfc, relative error < 1.2e-7
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
};

/** Objects: one "featured" object of the reader's chosen S/N plus 11 others. */
function makeSky(seed, featuredNu) {
  const R = rng(seed);
  const objs = [];
  for (let k = 0; k < 12; k++) {
    const nu = k === 0 ? featuredNu : Math.exp(Math.log(1) + (Math.log(5) - Math.log(1)) * R.u());
    const sp = 2 + 18 * R.u(), ang = 2 * Math.PI * R.u();
    const vx = sp * Math.cos(ang), vy = sp * Math.sin(ang), m = 4 * A;
    const x0 = m - Math.min(vx * T_SPAN, 0) + R.u() * (SIZE - 2 * m - Math.abs(vx) * T_SPAN);
    const y0 = m - Math.min(vy * T_SPAN, 0) + R.u() * (SIZE - 2 * m - Math.abs(vy) * T_SPAN);
    objs.push({ x0, y0, vx, vy, nu });
  }
  return { objs, seed };
}

/** The catalogue above threshold nuTh: noise peaks plus object detections. */
function makeCatalogue(sky, nuTh) {
  const R = rng(sky.seed * 7 + Math.round(nuTh * 10));
  const x = [], y = [], t = [], src = [];
  const lam = NOISE[nuTh] * (SIZE * SIZE) / (A * A);
  for (const ti of TIMES) {
    const nNoise = R.poisson(lam);
    for (let k = 0; k < nNoise; k++) { x.push(SIZE * R.u()); y.push(SIZE * R.u()); t.push(ti); src.push(-1); }
    sky.objs.forEach((o, j) => {
      const p = 0.5 * erfc((nuTh - o.nu) / Math.SQRT2);
      if (R.u() < p) {
        const sig = Math.SQRT2 * A / o.nu;          // S25 (after Portillo et al. 2020)
        x.push(o.x0 + o.vx * ti + sig * R.n()); y.push(o.y0 + o.vy * ti + sig * R.n()); t.push(ti); src.push(j);
      }
    });
  }
  return { x: Float64Array.from(x), y: Float64Array.from(y), t: Float64Array.from(t), src: Int16Array.from(src) };
}

/** Injected objects whose positions a track matches within 2a at half or more of the epochs. */
function matches(track, objs) {
  const out = [];
  objs.forEach((o, j) => {
    let ok = 0;
    for (const ti of TIMES) if (Math.hypot(track.x0 + track.vx * ti - (o.x0 + o.vx * ti), track.y0 + track.vy * ti - (o.y0 + o.vy * ti)) < 2 * A) ok += 1;
    if (ok >= TIMES.length / 2) out.push(j);
  });
  return out;
}

export function startShiftAndStack() {
  const $ = (id) => document.getElementById(id);
  const radio = (n) => document.querySelector(`input[name="${n}"]:checked`).value;
  const inp = { nu: $('ss-nu'), vx: $('ss-vx'), vy: $('ss-vy'), dx: $('ss-dx'), nmin: $('ss-nmin') };
  const out = { nu: $('ss-nu-out'), vx: $('ss-vx-out'), vy: $('ss-vy-out'), dx: $('ss-dx-out'), nmin: $('ss-nmin-out') };
  const catCanvas = $('ss-cat'), stackCanvas = $('ss-stack');
  let seed = 11, sky, cat, found = null;

  function rebuild() {
    sky = makeSky(seed, Number(inp.nu.value));
    cat = makeCatalogue(sky, Number(radio('ss-th')));
    found = null; $('ss-found').textContent = '';
    showValues(); drawCat(); drawStack();
  }
  function showValues() {
    out.nu.textContent = `S/N ${Number(inp.nu.value).toFixed(1)} per image`;
    out.vx.textContent = `${Number(inp.vx.value).toFixed(1)} px/h`;
    out.vy.textContent = `${Number(inp.vy.value).toFixed(1)} px/h`;
    out.dx.textContent = `${Number(inp.dx.value).toFixed(1)} a = ${(Number(inp.dx.value) * A).toFixed(0)} px`;
    out.nmin.textContent = `${inp.nmin.value} detections`;
    const o = sky ? sky.objs[0] : null;
    const nObj = cat ? Array.from(cat.src).filter((s) => s === 0).length : 0;
    $('ss-cat-read').textContent = cat ? `${fmt(cat.x.length)} detections in ${N_EP} images; ${fmt(Array.from(cat.src).filter((s) => s < 0).length)} of them noise. The highlighted object was detected in ${nObj} of the ${N_EP} images.` : '';
  }

  function drawCat() {
    const { ctx, w, h } = fit(catCanvas);
    const s = Math.min(w, h) / SIZE, ox = (w - SIZE * s) / 2, oy = (h - SIZE * s) / 2;
    ctx.fillStyle = '#fbfdfd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.axis; ctx.strokeRect(ox, oy, SIZE * s, SIZE * s);
    for (let k = 0; k < cat.x.length; k++) {
      const c = VIR[Math.min(4, Math.floor((cat.t[k] / T_SPAN) * 5))];
      dot(ctx, ox + cat.x[k] * s, oy + (SIZE - cat.y[k]) * s, 1.3, c);
    }
    ctx.strokeStyle = '#c4160c'; ctx.lineWidth = 1.5;          // the highlighted object's detections
    for (let k = 0; k < cat.x.length; k++) if (cat.src[k] === 0) { ctx.beginPath(); ctx.arc(ox + cat.x[k] * s, oy + (SIZE - cat.y[k]) * s, 4, 0, 2 * Math.PI); ctx.stroke(); }
    const o = sky.objs[0];
    if ($('ss-truth').checked) {
      ctx.lineWidth = 1;
      sky.objs.forEach((q, j) => {
        ctx.strokeStyle = j === 0 ? 'rgba(196,22,12,0.9)' : 'rgba(196,22,12,0.35)';
        ctx.beginPath(); ctx.moveTo(ox + q.x0 * s, oy + (SIZE - q.y0) * s); ctx.lineTo(ox + (q.x0 + q.vx * T_SPAN) * s, oy + (SIZE - (q.y0 + q.vy * T_SPAN)) * s); ctx.stroke();
      });
    }
    if (found) {
      for (const f of found) {
        ctx.strokeStyle = f.match.length ? '#078d97' : 'rgba(230,126,34,0.55)'; ctx.lineWidth = f.match.length ? 3 : 1;
        ctx.beginPath(); ctx.moveTo(ox + f.track.x0 * s, oy + (SIZE - f.track.y0) * s); ctx.lineTo(ox + (f.track.x0 + f.track.vx * T_SPAN) * s, oy + (SIZE - (f.track.y0 + f.track.vy * T_SPAN)) * s); ctx.stroke();
      }
    }
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('all 30 catalogues on one plot; colour = time (purple first, yellow last); red rings: the highlighted object', ox + 4, oy + 4);
  }

  function drawStack() {
    const vx = Number(inp.vx.value), vy = Number(inp.vy.value), dx = Number(inp.dx.value) * A;
    const { counts, nb, lo } = stack(cat, vx, vy, dx, 21, T_SPAN, SIZE);
    const { ctx, w, h } = fit(stackCanvas);
    const s = Math.min(w, h) / SIZE, ox = (w - SIZE * s) / 2, oy = (h - SIZE * s) / 2;
    ctx.fillStyle = '#fbfdfd'; ctx.fillRect(0, 0, w, h);
    let mx = 1, mk = 0;
    for (let k = 0; k < counts.length; k++) if (counts[k] > mx) { mx = counts[k]; mk = k; }
    const scaleTop = Math.max(8, mx);
    for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) {
      const c = counts[i * nb + j];
      if (!c) continue;
      const x0 = lo + i * dx, y0 = lo + j * dx;
      if (x0 + dx < 0 || y0 + dx < 0 || x0 > SIZE || y0 > SIZE) continue;
      const f = Math.min(1, c / scaleTop);
      ctx.fillStyle = `rgba(7,141,151,${0.12 + 0.88 * f})`;
      ctx.fillRect(ox + x0 * s, oy + (SIZE - y0 - dx) * s, dx * s + 0.5, dx * s + 0.5);
    }
    ctx.strokeStyle = COLORS.axis; ctx.strokeRect(ox, oy, SIZE * s, SIZE * s);
    // where the highlighted object's detections land
    const o = sky.objs[0];
    let inBin = 0, nObj = 0;
    const t0 = 0;
    for (let k = 0; k < cat.x.length; k++) if (cat.src[k] === 0) {
      nObj += 1;
      const px = cat.x[k] - vx * (cat.t[k] - t0), py = cat.y[k] - vy * (cat.t[k] - t0);
      ctx.strokeStyle = '#c4160c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ox + px * s, oy + (SIZE - py) * s, 3, 0, 2 * Math.PI); ctx.stroke();
    }
    const bi = Math.floor((o.x0 - lo) / dx), bj = Math.floor((o.y0 - lo) / dx);
    inBin = bi >= 0 && bj >= 0 && bi < nb && bj < nb ? counts[bi * nb + bj] : 0;
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('positions projected back to the first image; darker = fuller bin; red circles: the highlighted object', ox + 4, oy + 4);
    const err = Math.hypot(vx - o.vx, vy - o.vy);
    $('ss-stack-read').textContent = `Fullest bin: ${mx} detections. The bin at the highlighted object’s start holds ${inBin}. `
      + (err < dx / T_SPAN ? 'Your trial velocity is within one bin of its true velocity, so its detections pile up.' : `Your trial velocity is ${err.toFixed(1)} px/h from its true velocity: its detections smear along a ${(err * T_SPAN).toFixed(0)}-pixel line.`);
  }

  function runSearch() {
    const dx = Number(inp.dx.value) * A, nMin = Number(inp.nmin.value);
    const t0 = performance.now();
    const { results, nVelocities } = search(cat, dx, 1.5, 21, nMin, 60, SIZE);
    const ms = performance.now() - t0;
    found = results.map((r) => { const track = fitLine(cat, r.members); return { track, match: matches(track, sky.objs), n: r.n }; });
    const hit = new Set(found.flatMap((f) => f.match));
    const nFalse = found.filter((f) => !f.match.length).length;
    $('ss-found').textContent = `Searched ${fmt(nVelocities)} trial velocities in ${ms.toFixed(0)} ms: ${found.length} clusters of at least ${nMin}. `
      + `They recover ${hit.size} of the 12 objects (${hit.has(0) ? 'including' : 'but not'} the highlighted one); ${nFalse} match no object. `
      + `Undetected: ${sky.objs.map((o, j) => (hit.has(j) ? null : o.nu.toFixed(1))).filter(Boolean).join(', ') || 'none'} (S/N per image).`;
    drawCat();
  }

  document.querySelectorAll('input[name="ss-th"]').forEach((r) => r.addEventListener('change', rebuild));
  inp.nu.addEventListener('change', rebuild);
  inp.nu.addEventListener('input', showValues);
  [inp.vx, inp.vy, inp.dx].forEach((el) => el.addEventListener('input', () => { showValues(); drawStack(); }));
  inp.nmin.addEventListener('input', showValues);
  $('ss-new').addEventListener('click', () => { seed += 1; rebuild(); });
  $('ss-truth').addEventListener('change', drawCat);
  $('ss-search').addEventListener('click', runSearch);
  $('ss-hint').addEventListener('click', () => { const o = sky.objs[0]; inp.vx.value = String(o.vx.toFixed(1)); inp.vy.value = String(o.vy.toFixed(1)); showValues(); drawStack(); });
  rebuild();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { drawCat(); drawStack(); }); });
}
