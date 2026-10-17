// Validate src/scripts/od/od.js against the SciPy reference (tools/validate_od/reference.py)
// and JPL Horizons. Run reference.py first, then:
//   node tools/validate_od/compare.mjs
import { readFileSync } from 'node:fs';
import * as od from '../../src/scripts/od/od.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = read('../../public/data/od/yr4.json'), ref = read('reference.json'), hz = read('horizons.json').radec;
const m = od.load(data);
const KM = od.KM_PER_AU, all = m.obs.map((_, k) => k);
function inv6(C) {                 // Gauss-Jordan inverse of a small matrix
  const n = C.length, A = C.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    const d = A[i][i]; A[i] = A[i].map((v) => v / d);
    for (let k = 0; k < n; k++) if (k !== i) { const f = A[k][i]; A[k] = A[k].map((v, j) => v - f * A[i][j]); }
  }
  return A.map((r) => r.slice(n));
}
const sepAS = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / od.AS;

// 1. Force model, integrator and light time: JPL's orbit through the page's model, against Horizons
let t0 = performance.now();
const jpl = m.jpl.epoch_state;
const traj = od.propagate(m, jpl, m.epoch, m.obs[0].t - 0.01, m.predict + 0.01);
const t1 = performance.now();
const seps = m.obs.map((o, k) => {
  const [ra, dec] = od.observe(m, traj, o.t, o.site);
  return sepAS(od.unit(ra, dec), od.unit(hz[k][0] * Math.PI / 180, hz[k][1] * Math.PI / 180));
}).sort((a, b) => a - b);
const pPred = traj.at(m.predict);
const dPredH = Math.hypot(...[0, 1, 2].map((k) => pPred[k] - m.jpl.predict_state[k])) * KM;
const dPredPy = Math.hypot(...[0, 1, 2].map((k) => pPred[k] - ref.predict_from_jpl[k])) * KM;
console.log(`1. JPL orbit through the page's model vs Horizons astrometry: median ${seps[seps.length >> 1].toFixed(4)}", max ${seps[seps.length - 1].toFixed(4)}" (reference: median ${ref.model_vs_horizons_arcsec.median.toFixed(4)}", max ${ref.model_vs_horizons_arcsec.max.toFixed(4)}")`);
console.log(`   position on the prediction date: ${dPredH.toFixed(1)} km from Horizons, ${dPredPy.toFixed(2)} km from the SciPy integration; integration took ${(t1 - t0).toFixed(0)} ms`);

// 2. Least squares, from JPL's state as in the reference
const out = { };
for (const [label, days] of [['all', null], ['7d', 7], ['14d', 14], ['28d', 28]]) {
  const idx = days === null ? all : all.filter((k) => m.obs[k].t < m.obs[0].t + days);
  t0 = performance.now();
  const f = od.fit(m, idx, jpl);
  const ms = performance.now() - t0;
  const r = ref.fits[label];
  const dpy = Math.hypot(...[0, 1, 2].map((k) => f.x[k] - r.state[k])) * KM;
  const sig = Math.hypot(...[0, 1, 2].map((k) => Math.sqrt(f.cov[k][k]))) * KM;
  const dj = Math.hypot(...[0, 1, 2].map((k) => f.x[k] - jpl[k])) * KM;
  const sratio = [0, 1, 2, 3, 4, 5].map((k) => Math.sqrt(f.cov[k][k]) / r.sigma[k]);
  const dx = f.x.map((v, k) => v - r.state[k]), nsig = Math.sqrt(dx.reduce((s, v, p) => s + v * dx.reduce((s2, w, q) => s2 + inv6(f.cov)[p][q] * w, 0), 0));
  out[label] = { used: f.use.filter(Boolean).length, rms: f.rms };
  console.log(`2. fit ${label}: ${out[label].used}/${idx.length} used (ref ${r.used}), rms ${f.rms.toFixed(3)}" (ref ${r.rms_arcsec.toFixed(3)}"), `
    + `|x - JPL| ${dj.toFixed(0)} km (ref ${r.dpos_km.toFixed(0)}), position sigma ${sig.toFixed(0)} km; page - reference ${dpy.toFixed(1)} km (${nsig.toFixed(3)} sigma); `
    + `sigma ratios ${Math.min(...sratio).toFixed(3)}-${Math.max(...sratio).toFixed(3)}; ${ms.toFixed(0)} ms`);
}

// 3a. Gauss's method
for (const g of ref.gauss) {
  const sols = od.gauss(m, g.obs);
  sols.forEach((s, i) => {
    const r = g.solutions[i];
    const el = od.elements(s.xh, m.gm[0]);
    const dpos = r ? Math.hypot(...[0, 1, 2].map((k) => s.xh[k] - r.state[k])) * KM : NaN;
    console.log(`3a. Gauss on tracklets ${g.tracklets}: root ${s.root.toFixed(6)} au (ref ${r?.root.toFixed(6)}), rho2 ${s.rho2.toFixed(6)} au, a ${el.a.toFixed(4)} e ${el.e.toFixed(4)} i ${el.i.toFixed(3)}; page - reference ${dpos.toExponential(1)} km`);
  });
  if (sols.length) {
    const miss = od.keplerMisses(m, sols[0].xh, sols[0].t);
    console.log(`   two-body misses at its own three observations: ${g.obs.map((k) => miss[k].toFixed(4)).join(', ')}"`);
  }
  if (sols.length !== g.solutions.length) console.log(`   !! ${sols.length} solutions, reference ${g.solutions.length}`);
}

// 3b. Attributable and predictions from guessed distances
const A = ref.attributable, ks = m.tracklets[A.tracklet];
const att = od.attributable(m, ks), site = od.siteAt(m, ks, att.t);
const dAtt = [att.t - A.values[0], (att.ra - A.values[1]) / od.AS, (att.dec - A.values[2]) / od.AS, (att.rad - A.values[3]) / od.AS, (att.decd - A.values[4]) / od.AS];
console.log(`3b. attributable: page - reference ${dAtt.map((v) => v.toExponential(1)).join(', ')} (day, ", ", "/day, "/day); site ${(Math.hypot(...[0, 1, 2].map((k) => site[k] - A.site[k])) * KM).toFixed(4)} km`);
let worst = 0;
for (const s of A.samples) {
  const x = od.stateFrom(att, site, s.rho, s.rhodot), o = m.obs[A.target_obs];
  const tr = od.propagate(m, x, att.t, att.t, o.t + 0.01);
  const [ra, dec] = od.observe(m, tr, o.t, o.site);
  worst = Math.max(worst, sepAS(od.unit(ra, dec), od.unit(s.ra * Math.PI / 180, s.dec * Math.PI / 180)));
}
console.log(`   ${A.samples.length} predictions from guessed distances: largest difference from the reference ${worst.toFixed(4)}"`);

// 4. The coarser steps used for the family of predictions (1/32 day) and the uncertainty clouds (1/16 day)
const fine = od.propagate(m, jpl, m.epoch, m.epoch, m.predict + 0.01).at(m.predict);
const coarse = od.propagate(m, jpl, m.epoch, m.epoch, m.predict + 0.01, 1 / 16).at(m.predict);
const o8 = m.obs[m.tracklets[m.tracklets.findIndex((tk) => m.obs[tk[0]].t > att.t + 7.75)][0]];
const pT = traj.at(att.t), rhoT = Math.hypot(pT[0] - site[0], pT[1] - site[1], pT[2] - site[2]);
const x0 = od.stateFrom(att, site, rhoT, [0, 1, 2].reduce((s, k) => s + (pT[k] - site[k]) * (pT[k + 3] - site[k + 3]), 0) / rhoT);
const a64 = od.observe(m, od.propagate(m, x0, att.t, att.t, o8.t + 0.01), o8.t, o8.site);
const a32 = od.observe(m, od.propagate(m, x0, att.t, att.t, o8.t + 0.01, 1 / 32), o8.t, o8.site);
console.log(`4. 1/16-day step vs 1/64 on the prediction date: ${(Math.hypot(...[0, 1, 2].map((k) => fine[k] - coarse[k])) * KM).toFixed(2)} km; `
  + `1/32-day step vs 1/64 for a predicted position 8 days after discovery: ${sepAS(od.unit(...a64), od.unit(...a32)).toFixed(4)}"`);
