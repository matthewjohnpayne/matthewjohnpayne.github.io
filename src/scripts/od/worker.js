// Worker for the orbit-determination page: the slower computations (many
// orbits integrated at once, and least-squares fits) run here so that the
// page stays responsive.
import * as od from './od.js';

let m = null;

/** Sky offsets (arcsec; RA scaled by cos Dec) of the orbits from one guessed distance each, at observation k. */
function banana({ tracklet, target, samples }) {
  const ks = m.tracklets[tracklet], att = od.attributable(m, ks), site = od.siteAt(m, ks, att.t);
  const o = m.obs[target], out = new Float32Array(2 * samples.length);
  samples.forEach(([rho, rhod], i) => {
    const x = od.stateFrom(att, site, rho, rhod);
    const tr = od.propagate(m, x, att.t, att.t, o.t + 0.01, 1 / 32);
    const [ra, dec] = od.observe(m, tr, o.t, o.site);
    let d = ra - o.ra;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    out[2 * i] = d * Math.cos(o.dec) / od.AS;
    out[2 * i + 1] = (dec - o.dec) / od.AS;
  });
  return { out };
}

/** A starting orbit at the epoch: Gauss's method on the first, a middle and the last tracklets
 * (trying other middle tracklets if one gives no solution), keeping the root that fits best. */
function startingOrbit(trks) {
  const mid = (i) => m.tracklets[i][m.tracklets[i].length >> 1];
  const idx = trks.flatMap((i) => m.tracklets[i]);
  const n = trks.length, order = [];
  for (let d = 0; d < n; d++) for (const j of [(n >> 1) + d, (n >> 1) - d]) if (j > 0 && j < n - 1 && !order.includes(j)) order.push(j);
  let best = null;
  for (const j of order.slice(0, 8)) {
    for (const s of od.gauss(m, [trks[0], trks[j], trks[n - 1]].map(mid))) {
      const xb = od.toBary(m, s.xh, s.t);
      const x = od.propagate(m, xb, s.t, m.epoch, m.epoch).at(m.epoch);
      if (!x.every(Number.isFinite)) continue;
      const r = od.residuals(m, x, idx);
      let c = 0;
      r.dra.forEach((v, k) => { c += v * v + r.ddec[k] * r.ddec[k]; });
      if (Number.isFinite(c) && (!best || c < best.c)) best = { x, c };
    }
    if (best) break;
  }
  return best && best.x;
}

/** Least-squares fit to the tracklets trks; then the spread of positions on the prediction date. */
function fitArc({ trks, start, nSamples }) {
  const idx = trks.flatMap((i) => m.tracklets[i]);
  let x0 = startingOrbit(trks);
  let f = x0 ? od.fit(m, idx, x0) : null;
  if ((!f || !f.ok) && start) f = od.fit(m, idx, start);
  if (!f || !f.ok) return { ok: false };
  // Monte Carlo samples of the orbit from its covariance
  const L = od.cholesky(f.cov), jt = od.propagate(m, m.jpl.epoch_state, m.epoch, m.epoch, m.predict + 0.01, 1 / 16);
  const earth = [0, 0, 0];
  od.bodyState(m, 3, m.predict, earth);
  const [ra0, dec0] = od.observe(m, jt, m.predict, earth);
  const cloud = new Float32Array(2 * nSamples), els = [];
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gaussRand = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const sun = od.sunState(m, m.epoch);
  let nominal = null;
  for (let s = 0; s <= nSamples; s++) {
    const z = Array.from({ length: 6 }, gaussRand);
    const x = s === 0 ? f.x : f.x.map((v, p) => v + L[p].reduce((acc, l, q) => acc + l * z[q], 0));
    const tr = od.propagate(m, x, m.epoch, m.epoch, m.predict + 0.01, 1 / 16);
    const [ra, dec] = od.observe(m, tr, m.predict, earth);
    let d = ra - ra0;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    if (s === 0) { nominal = [d * Math.cos(dec0) / od.AS, (dec - dec0) / od.AS]; continue; }
    cloud[2 * (s - 1)] = d * Math.cos(dec0) / od.AS;
    cloud[2 * (s - 1) + 1] = (dec - dec0) / od.AS;
    els.push(od.elements(x.map((v, k) => v - sun[k]), m.gm[0]));
  }
  const stat = (key) => {
    const v = els.map((e) => e[key]), mu = v.reduce((a, b) => a + b, 0) / v.length;
    return [mu, Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1))];
  };
  return {
    ok: true, x: f.x, cov: f.cov, use: f.use, dra: Array.from(f.dra), ddec: Array.from(f.ddec), rms: f.rms, idx,
    nominal, cloud, elements: od.elements(f.x.map((v, k) => v - sun[k]), m.gm[0]),
    sigma: { a: stat('a')[1], e: stat('e')[1], i: stat('i')[1], q: stat('q')[1] }
  };
}

self.onmessage = (ev) => {
  const { id, type, payload } = ev.data;
  if (type === 'init') { m = od.load(payload); self.postMessage({ id, result: true }); return; }
  try {
    const result = type === 'banana' ? banana(payload) : fitArc(payload);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
