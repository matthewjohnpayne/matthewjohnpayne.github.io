// RV models, posterior and samplers for the RUN DMC page, ported from the science-notebooks
// module notebooks/rv_demcmc/rvdemc.py (after Nelson, Ford & Payne 2014, ApJS 210, 11; NFP14).
// The N-body model integrates coplanar, edge-on planets set up from Jacobi elements as REBOUND
// does, with the sixth-order integrator of ../rvlaplace/physics.js. Validated against the
// notebook's REBOUND model by tools/validate_rvdemc/. Units: days, m/s, solar masses, au.
import { fromElements } from '../ttv/physics.js';
import { advance } from '../rvlaplace/physics.js';

export const G = 2.959122082855911e-4;
export const AU_D_TO_MS = 1.495978707e11 / 86400;
export const M_JUP = 9.547919e-4;

function keplerE(M, e) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 50; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** NFP14 Eq. 1 without the offset: the sum of Keplerian signals. */
export function keplerianRV(planets, t) {
  const v = new Float64Array(t.length);
  for (const p of planets) {
    for (let k = 0; k < t.length; k++) {
      let M = (p.M + (2 * Math.PI * t[k]) / p.P) % (2 * Math.PI);
      if (M < 0) M += 2 * Math.PI;
      const E = keplerE(M, p.e);
      const f = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2));
      v[k] += p.K * (Math.cos(p.omega + f) + p.e * Math.cos(p.omega));
    }
  }
  return v;
}

/** Planet mass (Msun) giving semi-amplitude K, as rvdemc.mass_from_K. */
export function massFromK(K, P, e, mStar) {
  const k = Math.cbrt((2 * Math.PI * G) / P) * AU_D_TO_MS;
  let m = (K / k) * mStar ** (2 / 3) * Math.sqrt(1 - e * e);
  for (let i = 0; i < 30; i++) m = (K / k) * (mStar + m) ** (2 / 3) * Math.sqrt(1 - e * e);
  return m;
}

/** The star's RV (-v_z, m/s) at times t (sorted, >= 0) from an N-body integration. */
export function nbodyRV(planets, t, mStar, dtFrac = 1 / 60) {
  const ps = planets.slice().sort((a, b) => a.P - b.P);
  const n = ps.length + 1, y = new Float64Array(6 * n), m = [mStar];
  let com = [0, 0, 0, 0, 0, 0], mint = mStar;
  ps.forEach((p, i) => {
    const mp = massFromK(p.K, p.P, p.e, mint);
    const gm = G * (mint + mp), a = Math.cbrt((gm * p.P * p.P) / (4 * Math.PI * Math.PI));
    const s = fromElements(gm, a, p.e, Math.PI / 2, 0, p.omega, p.M).map((c, k) => c + com[k]);
    y.set(s, 6 * (i + 1));
    com = com.map((c, k) => (mint * c + mp * s[k]) / (mint + mp));
    mint += mp; m.push(mp);
  });
  for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) y[6 * i + k] -= com[k];
  const h = ps[0].P * dtFrac;
  const out = new Float64Array(t.length);
  let now = 0;
  for (let k = 0; k < t.length; k++) {
    const span = t[k] - now;
    if (span > 0) {
      const nst = Math.ceil(span / h - 1e-9);
      advance(y, m, span / nst, nst);
      now = t[k];
    }
    out[k] = -y[5] * AU_D_TO_MS;
  }
  return out;
}

/** NFP14's sampling parameters -> planets, offset, jitter (as rvdemc.unpack). */
export function unpack(x, nPl = 2) {
  const planets = [];
  for (let i = 0; i < nPl; i++) {
    const [lp, kc, ks, ec, es] = x.slice(5 * i, 5 * i + 5);
    const e = Math.hypot(ec, es), omega = Math.atan2(es, ec);
    planets.push({ P: Math.expm1(lp), K: Math.hypot(kc, ks), e, omega, M: Math.atan2(ks, kc) - omega });
  }
  return { planets, C: x[5 * nPl], jit: Math.expm1(x[5 * nPl + 1]) };
}

/** Log posterior with NFP14's priors (as rvdemc.Posterior, N-body or Keplerian model). */
export function makePosterior(data, mStar, model = 'nbody') {
  const t = Float64Array.from(data.t), rv = data.rv, err = data.err;
  const f = (x) => {
    const { planets, C, jit } = unpack(x);
    if (jit < 0) return -Infinity;
    let lp = 0;
    for (const p of planets) {
      if (!(p.e >= 0 && p.e < 0.9) || p.P <= 0 || p.K <= 0) return -Infinity;
      lp += -Math.log1p(p.K) - Math.log(p.K) - Math.log(Math.max(p.e, 1e-12));
    }
    const mod = model === 'nbody' ? nbodyRV(planets, t, mStar) : keplerianRV(planets, t);
    let ll = 0;
    for (let k = 0; k < t.length; k++) {
      const v = err[k] ** 2 + jit * jit, r = rv[k] - mod[k] - C;
      ll -= 0.5 * ((r * r) / v + Math.log(2 * Math.PI * v));
    }
    return Number.isFinite(ll) ? lp + ll : -Infinity;
  };
  f.count = 0;
  const g = (x) => { g.count += 1; return f(x); };
  g.count = 0;
  return g;
}

/** Seeded uniform and normal deviates. */
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const n = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  return { u, n };
}

/** One generation of NFP14's DEMCMC (as rvdemc.demcmc). state: {x, lp, gamma0, g}. */
export function demcmcGeneration(logp, st, R) {
  const nCh = st.x.length, nDim = st.x[0].length;
  let nAcc = 0;
  const props = [];
  for (let i = 0; i < nCh; i++) {
    let j, k;
    do { j = Math.floor(R.u() * nCh); } while (j === i);
    do { k = Math.floor(R.u() * nCh); } while (k === i || k === j);
    const gam = st.g % 100 === 99 ? 1 : st.gamma0 * (1 + 0.1 * R.n());
    props.push(st.x[i].map((v, d) => v + gam * (st.x[j][d] - st.x[k][d])));
  }
  for (let i = 0; i < nCh; i++) {
    const lpn = logp(props[i]);
    if (Math.log(R.u()) < lpn - st.lp[i]) { st.x[i] = props[i]; st.lp[i] = lpn; nAcc += 1; }
  }
  const f = nAcc / nCh;
  if (st.g % 100 !== 99) st.gamma0 *= f < 0.2 ? 0.9 : f > 0.31 ? 1.1 : Math.sqrt(Math.max(f, 1e-3) / 0.25);
  st.g += 1;
  return f;
}

/** One random-walk Metropolis step with per-parameter scales. state: {x, lp}. */
export function randomWalkStep(logp, st, scales, R) {
  const prop = st.x.map((v, d) => v + scales[d] * R.n());
  const lpn = logp(prop);
  if (Math.log(R.u()) < lpn - st.lp) { st.x = prop; st.lp = lpn; return 1; }
  return 0;
}
