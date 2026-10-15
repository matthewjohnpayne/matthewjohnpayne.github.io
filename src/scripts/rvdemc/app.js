// The RUN DMC page: why interacting planets need N-body RV models, and a race between a
// random-walk sampler and DEMCMC on the N-body posterior (after Nelson, Ford & Payne 2014).
import DATA from '../../data/rvdemc.json';
import { nbodyRV, keplerianRV } from './model.js';
import { COLORS, fit, frame, dot, fmt } from '../plotting.js';

const RW = '#078d97', DE = '#e67e22';
const BURN = 50;    // DEMCMC generations dropped as burn-in when plotting the samples

/** Integrated autocorrelation time with Sokal's automatic window (as rvdemc.autocorr_time). */
function autocorrTime(y, c = 5) {
  const n = y.length;
  if (n < 10) return NaN;
  let m = 0; for (const v of y) m += v; m /= n;
  const maxLag = n - 1;
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += (y[i] - m) * (y[i + lag] - m); acf[lag] = s; }
  let tau = 1;
  for (let lag = 1; lag <= maxLag; lag++) { tau += 2 * acf[lag] / acf[0]; if (lag >= c * tau) return tau; }
  return tau;
}

export function startRunDmc() {
  const $ = (id) => document.getElementById(id);
  const radio = (n) => document.querySelector(`input[name="${n}"]:checked`).value;
  const tFine = Float64Array.from({ length: 3000 }, (_, i) => (1500 * i) / 2999);

  // ---- section 1: N-body against Keplerian
  const mass = $('rd-mass');
  function drawModels() {
    const f = Number(mass.value);
    $('rd-mass-out').textContent = f === 1 ? 'as simulated (0.61 and 1.93 Jupiter masses)' : `${f}× (${(0.61 * f).toFixed(2)} and ${(1.93 * f).toFixed(2)} Jupiter masses)`;
    const pl = DATA.truth.map((p) => ({ ...p, K: p.K * f }));
    const nb = nbodyRV(pl, tFine, DATA.m_star), kp = keplerianRV(pl, tFine);
    const { ctx, w, h } = fit($('rd-rv'));
    const h1 = h * 0.62;
    let lo = Infinity, hi = -Infinity;
    for (const v of nb) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (const v of DATA.rv) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = 0.08 * (hi - lo);
    const A = frame(ctx, w, h1, { x0: 0, x1: 1500, y0: lo - pad, y1: hi + pad, xlabel: '', ylabel: 'star’s radial velocity (m/s)', left: 58 });
    A.clip();
    const line = (F, arr, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); arr.forEach((v, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, F.X(tFine[k]), F.Y(v))); ctx.stroke(); };
    line(A, kp, 'rgba(196,22,12,0.7)', 1);
    line(A, nb, RW, 1.2);
    if (f === 1) DATA.t.forEach((t, k) => dot(ctx, A.X(t), A.Y(DATA.rv[k]), 2.2, COLORS.ink));
    ctx.restore();
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = RW; ctx.fillText('N-body', A.L + 8, A.T + 6);
    ctx.fillStyle = COLORS.red; ctx.fillText('sum of Keplerian orbits, same starting orbits', A.L + 70, A.T + 6);
    if (f === 1) { ctx.fillStyle = COLORS.ink; ctx.fillText('● simulated data (3 m/s errors)', A.L + 360, A.T + 6); }
    let dmax = 0;
    const diff = nb.map((v, k) => { const d = v - kp[k]; dmax = Math.max(dmax, Math.abs(d)); return d; });
    ctx.save(); ctx.translate(0, h1);
    const D = frame(ctx, w, h - h1, { x0: 0, x1: 1500, y0: -dmax * 1.1 || -1, y1: dmax * 1.1 || 1, xlabel: 'days', ylabel: 'difference (m/s)', left: 58, top: 8, yticks: 3 });
    D.clip(); line(D, diff, COLORS.ink, 1); ctx.restore();
    ctx.restore();
    $('rd-rv-read').textContent = `After 1,500 days the two models differ by up to ${fmt(dmax)} m/s, against measurement errors of 3 m/s. `
      + (f === 1 ? `Fitting the data, the best sum of Keplerian orbits leaves χ²/N = ${DATA.chi2_kep.toFixed(0)}; the best N-body model reaches ${DATA.chi2_nb.toFixed(2)}.` : '');
  }
  mass.addEventListener('input', drawModels);

  // ---- section 2: the race
  const [iA, iB] = DATA.pair;   // indices into [m_c, m_b, P_c, P_b, e_c, e_b]: the periods
  const target = DATA.gauss_phys.map((r) => [r[iA], r[iB]]);
  const sdPb = Math.sqrt(target.reduce((s, r, _, a) => s + (r[1] - a.reduce((q, z) => q + z[1], 0) / a.length) ** 2, 0) / target.length);
  const truthP = [DATA.truth[0].P, DATA.truth[1].P];
  let runs = { rw: null, de: null }, workers = [];
  const xr = [Math.min(...target.map((r) => r[0])), Math.max(...target.map((r) => r[0]))];
  const yr = [Math.min(...target.map((r) => r[1])), Math.max(...target.map((r) => r[1]))];
  const widen = (r, k) => { const d = (r[1] - r[0]) * k; return [r[0] - d, r[1] + d]; };
  const XR = widen(xr, 0.25), YR = widen(yr, 0.25);

  function drawRace() {
    const { ctx, w, h } = fit($('rd-scatter'));
    const F = frame(ctx, w, h, { x0: XR[0], x1: XR[1], y0: YR[0], y1: YR[1], xlabel: 'period of planet c (days)', ylabel: 'period of planet b (days)', left: 58 });
    F.clip();
    for (const [a, b] of target) dot(ctx, F.X(a), F.Y(b), 1.6, 'rgba(91,111,124,0.22)');
    if (runs.de) for (const s of runs.de.pts) dot(ctx, F.X(s[1]), F.Y(s[2]), s[4] > BURN ? 1.4 : 1, s[4] > BURN ? 'rgba(230,126,34,0.45)' : 'rgba(150,90,40,0.18)');
    if (runs.rw) {
      ctx.strokeStyle = 'rgba(7,141,151,0.8)'; ctx.lineWidth = 1; ctx.beginPath();
      runs.rw.pts.forEach((s, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, F.X(s[1]), F.Y(s[2]))); ctx.stroke();
      const e = runs.rw.pts[runs.rw.pts.length - 1];
      if (e) dot(ctx, F.X(e[1]), F.Y(e[2]), 4, RW);
    }
    ctx.strokeStyle = COLORS.red; ctx.lineWidth = 2;
    const tx = F.X(truthP[0]), ty = F.Y(truthP[1]);
    ctx.beginPath(); ctx.moveTo(tx - 6, ty); ctx.lineTo(tx + 6, ty); ctx.moveTo(tx, ty - 6); ctx.lineTo(tx, ty + 6); ctx.stroke();
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const leg = [['rgba(91,111,124,0.6)', 'the posterior (Gaussian approximation)'], [RW, 'random walk: its path'], [DE, 'DEMCMC: all 36 chains'], ['rgba(150,90,40,0.6)', `(faint: burn-in, first ${BURN} generations)`], [COLORS.red, '+ true periods']];
    leg.forEach(([c, t], k) => { ctx.fillStyle = c; ctx.fillText(t, F.L + F.pw - 260, F.T + 6 + 15 * k); });

    // traces: planet b's period against evaluations
    const T = fit($('rd-trace'));
    const budget = Number(radio('rd-budget'));
    const G = frame(T.ctx, T.w, T.h, { x0: 0, x1: budget, y0: YR[0], y1: YR[1], xlabel: 'posterior evaluations', ylabel: 'period of b (days)', left: 58, yticks: 3 });
    G.clip();
    const tr = (pts, c, filter) => { T.ctx.strokeStyle = c; T.ctx.lineWidth = 1; T.ctx.beginPath(); let first = true; for (const s of pts) { if (!filter(s)) continue; (first ? T.ctx.moveTo : T.ctx.lineTo).call(T.ctx, G.X(s[0]), G.Y(s[2])); first = false; } T.ctx.stroke(); };
    if (runs.rw) tr(runs.rw.pts, RW, () => true);
    if (runs.de) tr(runs.de.pts, DE, (s) => s[3] === 0);
    T.ctx.restore();
    // where DEMCMC's burn-in ends (36 evaluations per generation)
    const xb = G.X(BURN * 36);
    T.ctx.strokeStyle = 'rgba(150,90,40,0.7)'; T.ctx.setLineDash([4, 4]); T.ctx.beginPath(); T.ctx.moveTo(xb, G.T); T.ctx.lineTo(xb, G.T + G.ph); T.ctx.stroke(); T.ctx.setLineDash([]);
    T.ctx.fillStyle = 'rgba(150,90,40,0.9)'; T.ctx.font = '11px system-ui, sans-serif'; T.ctx.textAlign = 'left'; T.ctx.textBaseline = 'top';
    T.ctx.fillText('DEMCMC burn-in ends', xb + 4, G.T + 4);
    T.ctx.textAlign = 'right';
    T.ctx.fillStyle = DE; T.ctx.fillText('one DEMCMC chain', G.L + G.pw - 6, G.T + 4);
    T.ctx.fillStyle = RW; T.ctx.fillText('random walk', G.L + G.pw - 6 - T.ctx.measureText('one DEMCMC chain').width - 14, G.T + 4);

    const read = (r, name) => {
      if (!r) return '';
      if (!r.done) return `${name}: ${fmt(r.evals)} evaluations, ${Math.round(100 * r.acc)}% of proposals accepted…`;
      // Independent samples, from the integrated autocorrelation time (as the notebook measures it):
      // the largest over all 12 parameters; for DEMCMC per chain, in generations, after burn-in.
      const ND = DATA.map.length;
      let tau, n;
      if (name === 'DEMCMC') {
        const nCh = 36, per = Array.from({ length: nCh }, () => Array.from({ length: ND }, () => []));
        for (const s of r.pts) if (s[4] > BURN) for (let d = 0; d < ND; d++) per[s[3]][d].push(s[5 + d]);
        tau = 0;
        for (let d = 0; d < ND; d++) tau = Math.max(tau, per.reduce((q, c) => q + autocorrTime(c[d]), 0) / nCh);
        n = per[0][0].length;
        return `${name}: ${fmt(r.evals)} evaluations, ${Math.round(100 * r.acc)}% accepted. Its slowest parameter decorrelates in about ${fmt(tau)} generations, so it takes about ${fmt(tau)} evaluations per independent sample: roughly ${fmt(nCh * n / tau)} independent samples`
          + (n / tau < 50 ? ` (rough, and probably optimistic: each chain is only ${fmt(n / tau)} autocorrelation times long, and short chains underestimate them).` : '.');
      }
      const k0 = Math.floor(r.pts.length / 10), xs = r.pts.slice(k0);
      tau = 0;
      for (let d = 0; d < ND; d++) tau = Math.max(tau, autocorrTime(xs.map((s) => s[5 + d])));
      n = xs.length;
      return `${name}: ${fmt(r.evals)} evaluations, ${Math.round(100 * r.acc)}% accepted. About ${fmt(tau)} evaluations per independent sample (slowest parameter): roughly ${fmt(n / tau)} independent samples`
        + (n / tau < 50 ? ` (rough, and probably optimistic: the chain is only ${fmt(n / tau)} autocorrelation times long, and short chains underestimate them).` : '.');
    };
    $('rd-race-read').innerHTML = [read(runs.rw, 'Random walk'), read(runs.de, 'DEMCMC')].filter(Boolean).join('<br>');
  }

  function race() {
    workers.forEach((wk) => wk.terminate());
    const budget = Number(radio('rd-budget')), scale = Number(radio('rd-step'));
    runs = { rw: { pts: [], evals: 0, acc: 0, done: false }, de: { pts: [], evals: 0, acc: 0, done: false } };
    $('rd-race-read').textContent = '';
    workers = ['rw', 'de'].map((kind, i) => {
      const wk = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      wk.onmessage = ({ data: m }) => {
        const r = runs[m.kind];
        for (const s of m.batch) r.pts.push(s);
        Object.assign(r, { evals: m.evals, acc: m.acc, done: m.done });
        if (m.done) wk.terminate();
        requestAnimationFrame(drawRace);
      };
      wk.postMessage({ kind, data: DATA, budget, scale, seed: 17 + i });
      return wk;
    });
  }
  $('rd-race').addEventListener('click', race);

  drawModels(); drawRace();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { drawModels(); drawRace(); }); });
}
