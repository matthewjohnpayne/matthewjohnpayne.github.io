// Interacting planets for the RV/Laplace page: a star with several planets set up from Jacobi
// orbital elements as REBOUND does, integrated in the barycentric frame with a sixth-order
// symplectic composition (Yoshida 1990) of the drift-kick-drift leapfrog, plus the star's
// radial velocity and the planets' osculating Jacobi elements. Validated against the
// science-notebooks modules rv_demcmc/rvdemc.py and laplace_gj876/gj876.py (REBOUND) by
// tools/validate_rvlaplace/. Units: au, days, solar masses.
import { fromElements } from '../ttv/physics.js';

export const G = 2.959122082855911e-4;
export const M_EARTH = 3.003489e-6, M_JUP = 9.547919e-4;
export const AU_D_TO_MS = 1.495978707e11 / 86400;
const DEG = Math.PI / 180;

const W = [0.784513610477560, 0.235573213359357, -1.17767998417887];
const W0 = 1 - 2 * (W[0] + W[1] + W[2]);
const YOSHIDA6 = [W[0], W[1], W[2], W0, W[2], W[1], W[0]];

/** Barycentric state (Float64Array of 6 per body) for a star and planets given Jacobi elements
 *  {m, a, e, inc, Omega, omega, M} (angles in radians). */
export function jacobiSetup(mStar, planets) {
  const n = planets.length + 1;
  const y = new Float64Array(6 * n), m = [mStar];
  let com = [0, 0, 0, 0, 0, 0], mint = mStar;
  planets.forEach((p, i) => {
    const rel = fromElements(G * (mint + p.m), p.a, p.e, p.inc, p.Omega, p.omega, p.M);
    const s = com.map((c, k) => c + rel[k]);
    y.set(s, 6 * (i + 1));
    com = com.map((c, k) => (mint * c + p.m * s[k]) / (mint + p.m));
    mint += p.m;
    m.push(p.m);
  });
  for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) y[6 * i + k] -= com[k];
  return { y, m };
}

function accel(y, m, a) {
  const n = m.length;
  a.fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = y[6 * j] - y[6 * i], dy = y[6 * j + 1] - y[6 * i + 1], dz = y[6 * j + 2] - y[6 * i + 2];
    const r2 = dx * dx + dy * dy + dz * dz, inv3 = G / (r2 * Math.sqrt(r2));
    a[3 * i] += m[j] * inv3 * dx; a[3 * i + 1] += m[j] * inv3 * dy; a[3 * i + 2] += m[j] * inv3 * dz;
    a[3 * j] -= m[i] * inv3 * dx; a[3 * j + 1] -= m[i] * inv3 * dy; a[3 * j + 2] -= m[i] * inv3 * dz;
  }
}

/** Advance y in place by nSteps steps of dt (days). */
export function advance(y, m, dt, nSteps) {
  const n = m.length, a = new Float64Array(3 * n);
  const drift = (h) => { for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) y[6 * i + k] += h * y[6 * i + 3 + k]; };
  for (let s = 0; s < nSteps; s++) {
    let pending = 0;
    for (const w of YOSHIDA6) {
      drift(pending + 0.5 * w * dt);
      accel(y, m, a);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) y[6 * i + 3 + k] += w * dt * a[3 * i + k];
      pending = 0.5 * w * dt;
    }
    drift(pending);
  }
}

/** The star's radial velocity (m/s) for a line of sight along +z: -v_z of the star. */
export const starRV = (y) => -y[5] * AU_D_TO_MS;

/** Osculating Jacobi elements of each planet: [{a, e, lambda, pomega}] (radians). */
export function jacobiElements(y, m) {
  const out = [];
  let com = [y[0], y[1], y[2], y[3], y[4], y[5]], mint = m[0];
  for (let i = 1; i < m.length; i++) {
    const r = [0, 1, 2].map((k) => y[6 * i + k] - com[k]), v = [0, 1, 2].map((k) => y[6 * i + 3 + k] - com[3 + k]);
    const mu = G * (mint + m[i]);
    const rn = Math.hypot(...r), v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
    const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
    const hn = Math.hypot(...h);
    const vxh = [v[1] * h[2] - v[2] * h[1], v[2] * h[0] - v[0] * h[2], v[0] * h[1] - v[1] * h[0]];
    const ev = [0, 1, 2].map((k) => vxh[k] / mu - r[k] / rn), e = Math.hypot(...ev);
    const a = 1 / (2 / rn - v2 / mu);
    const inc = Math.acos(h[2] / hn);
    const Om = Math.atan2(h[0], -h[1]);
    const nd = [Math.cos(Om), Math.sin(Om), 0];
    // argument of pericentre and true anomaly, measured in the orbital plane from the node
    const q = [h[1] * nd[2] - h[2] * nd[1], h[2] * nd[0] - h[0] * nd[2], h[0] * nd[1] - h[1] * nd[0]].map((c) => c / hn);
    const om = Math.atan2(ev[0] * q[0] + ev[1] * q[1] + ev[2] * q[2], ev[0] * nd[0] + ev[1] * nd[1]);
    const uArg = Math.atan2(r[0] * q[0] + r[1] * q[1] + r[2] * q[2], r[0] * nd[0] + r[1] * nd[1]);
    const f = uArg - om;
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(f / 2));
    const Mn = E - e * Math.sin(E);
    out.push({ a, e, inc, lambda: Om + om + Mn, pomega: Om + om });
    com = com.map((c, k) => (mint * c + m[i] * y[6 * i + k]) / (mint + m[i]));
    mint += m[i];
  }
  return out;
}

// N16 Table 3 coplanar medians (as in laplace_gj876/gj876.py); masses in Earth masses for a
// 0.37 Msun star, a in au (Jacobi), angles in degrees; all at inclination 53.19 deg, node 0.
export const GJ876 = {
  mStar: 0.37, inc: 53.19,
  planets: [
    { name: 'd', m: 7.49, a: 0.02183911, e: 0.119, omega: -140.90, M: 301.87 },
    { name: 'c', m: 266.2, a: 0.135989, e: 0.2531, omega: 115.96, M: -220.68 },
    { name: 'b', m: 845.3, a: 0.218585, e: 0.0368, omega: 110.80, M: -285.38 },
    { name: 'e', m: 16.58, a: 0.3514, e: 0.031, omega: 129.56, M: -175.89 }
  ]
};

/** Integrate GJ 876 (optionally scaling planet e's mass) and return times (yr) and the resonant
 *  angles phi_cb_c, phi_cb_b, phi_be_b and the Laplace angle (radians) at nOut samples. */
export function gj876Angles({ years = 60, nOut = 1500, eMass = 1, dt = 0.03 } = {}) {
  const pl = GJ876.planets.map((p) => ({ m: p.m * M_EARTH * (p.name === 'e' ? eMass : 1), a: p.a, e: p.e,
    inc: GJ876.inc * DEG, Omega: 0, omega: p.omega * DEG, M: p.M * DEG }));
  const { y, m } = jacobiSetup(GJ876.mStar, pl);
  const steps = Math.round((years * 365.25) / dt / (nOut - 1));
  const out = { t: new Float64Array(nOut), cb_c: new Float64Array(nOut), cb_b: new Float64Array(nOut), be_b: new Float64Array(nOut), laplace: new Float64Array(nOut) };
  const wrap = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  for (let k = 0; k < nOut; k++) {
    if (k) advance(y, m, dt, steps);
    const el = jacobiElements(y, m);
    const [, c, b, e] = el;
    out.t[k] = (k * steps * dt) / 365.25;
    out.cb_c[k] = wrap(c.lambda - 2 * b.lambda + c.pomega);
    out.cb_b[k] = wrap(c.lambda - 2 * b.lambda + b.pomega);
    out.be_b[k] = wrap(b.lambda - 2 * e.lambda + b.pomega);
    out.laplace[k] = wrap(c.lambda - 3 * b.lambda + 2 * e.lambda);
  }
  return out;
}

/** N16's libration amplitude: sqrt(2) x the RMS deviation about the circular mean (degrees);
 *  null if the angle circulates (fills all 36 ten-degree bins). */
export function amplitude(x) {
  const bins = new Uint8Array(36);
  let sc = 0, ss = 0;
  for (const v of x) { bins[Math.min(35, Math.floor(((v + Math.PI) / (2 * Math.PI)) * 36))] = 1; sc += Math.cos(v); ss += Math.sin(v); }
  if (bins.every((b) => b)) return null;
  const c = Math.atan2(ss, sc);
  let s2 = 0, s1 = 0;
  for (const v of x) { const d = ((v - c + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; s1 += d; s2 += d * d; }
  const mean = s1 / x.length;
  return Math.sqrt(2) * Math.sqrt(s2 / x.length - mean * mean) / DEG;
}
