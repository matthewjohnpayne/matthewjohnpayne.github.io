// How planets lose their moons around white dwarfs, after Payne, Veras, Holman &
// Gänsicke (2016, MNRAS 457, 217). A port of the encounter experiment in the
// science-notebooks module notebooks/exomoons_wd/exomoons.py: a star, a planet on a
// circular orbit at 30 au, an equal-mass planet flying past it, and test moons,
// integrated with a Bulirsch-Stoer method (as in the paper, which used Mercury's).
// Units: au, days and solar masses. Validated against the notebook's REBOUND runs by
// tools/validate_exomoons/.

export const G = 2.959122082855911e-4;
export const AU_KM = 1.495978707e8;
export const M_JUP = 9.547919e-4, M_EARTH = 3.003489e-6;
export const R_JUP = 71492 / AU_KM, R_EARTH = 6371 / AU_KM;
export const A_P = 30, M_STAR = 1;

/** PVHG16 Eq. 1: r_H = a (1 - e) (M_p / 3 M_star)^(1/3). */
export const hillRadius = (a, e, mp, ms) => a * (1 - e) * Math.cbrt(mp / (3 * ms));

// PVHG16 Table 1.
export const FLYBYS = {
  A: { q: 10, vq: 1e-3, mp: M_JUP, tSim: 2.5e4, note: 'Common, little effect' },
  B: { q: 1, vq: 1e-3, mp: M_JUP, tSim: 2.5e4, note: 'Relatively rare, destructive' },
  C: { q: 1, vq: 3e-4, mp: M_JUP, tSim: 8.3e3, note: 'Very rare, highly destructive' },
  X: { q: 1, vq: 1e-3, mp: M_EARTH, tSim: 3.6e3, note: 'Common, little effect' },
  Y: { q: 3e-2, vq: 3e-4, mp: M_EARTH, tSim: 1.2e4, note: 'Relatively rare, destructive' },
  Z: { q: 1e-2, vq: 3e-4, mp: M_EARTH, tSim: 1.2e4, note: 'Very rare, highly destructive' }
};

// Hill-radius growth through post-main-sequence mass loss, r_H(WD)/r_H(MS), from the SSE
// stellar tracks quoted in PVHG16 Sec. 2, for progenitors of 1-8 Msun. With r_H ∝ M^(-4/3)
// (their Eq. 8), each ratio implies a white dwarf mass M_MS / ratio^(3/4).
export const HILL_GROWTH = { 1: 2.39, 2: 4.57, 3: 6.35, 4: 7.65, 5: 8.55, 6: 9.16, 7: 9.53, 8: 9.83 };

// ------------------------------------------------------------ the N-body system
// State: Float64Array of 6 per body (x, y, z, vx, vy, vz). Bodies 0-2 are massive (star,
// parent, flyby); any further bodies are massless moons.
function deriv(y, m, nb, out) {
  for (let i = 0; i < nb; i++) { out[6 * i] = y[6 * i + 3]; out[6 * i + 1] = y[6 * i + 4]; out[6 * i + 2] = y[6 * i + 5]; out[6 * i + 3] = 0; out[6 * i + 4] = 0; out[6 * i + 5] = 0; }
  for (let i = 0; i < nb; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const dx = y[6 * j] - y[6 * i], dy = y[6 * j + 1] - y[6 * i + 1], dz = y[6 * j + 2] - y[6 * i + 2];
      const r2 = dx * dx + dy * dy + dz * dz, f = G * m[j] / (r2 * Math.sqrt(r2));
      out[6 * i + 3] += f * dx; out[6 * i + 4] += f * dy; out[6 * i + 5] += f * dz;
    }
  }
}

/** Error norm: massive bodies relative to their own scale; each moon relative to its
 * position and velocity about the parent planet (body 1), so close-in moons stay accurate. */
function errNorm(a, b, y, nb) {
  let e = 0;
  for (let i = 0; i < nb; i++) {
    let dr = 0, dv = 0, sr = 0, sv = 0;
    for (let k = 0; k < 3; k++) {
      let d = a[6 * i + k] - b[6 * i + k], dvel = a[6 * i + 3 + k] - b[6 * i + 3 + k];
      let x = y[6 * i + k], v = y[6 * i + 3 + k];
      if (i >= 3) { d -= a[6 + k] - b[6 + k]; dvel -= a[9 + k] - b[9 + k]; x -= y[6 + k]; v -= y[9 + k]; }
      dr += d * d; dv += dvel * dvel; sr += x * x; sv += v * v;
    }
    e = Math.max(e, Math.sqrt(dr / sr), Math.sqrt(dv / sv));
  }
  return e;
}

const SEQ = [2, 4, 6, 8, 10, 12, 14, 16];

function midpoint(y0, m, nb, H, n, out, f0, tmp) {
  const h = H / n, N = y0.length;
  const ym = Float64Array.from(y0), yn = new Float64Array(N);
  for (let k = 0; k < N; k++) yn[k] = y0[k] + h * f0[k];
  for (let s = 1; s < n; s++) {
    deriv(yn, m, nb, tmp);
    for (let k = 0; k < N; k++) { const t = ym[k] + 2 * h * tmp[k]; ym[k] = yn[k]; yn[k] = t; }
  }
  deriv(yn, m, nb, tmp);
  for (let k = 0; k < N; k++) out[k] = 0.5 * (ym[k] + yn[k] + h * tmp[k]);
}

/**
 * Integrate state y (in place) from 0 to T (T may be negative) with Bulirsch-Stoer
 * (modified midpoint + polynomial extrapolation in h^2), relative tolerance tol.
 * Returns the number of accepted steps. onStep(t, y) is called after each step.
 */
export function integrate(y, m, T, { tol = 1e-12, h0 = null, onStep = null, maxSteps = 5e6 } = {}) {
  const nb = y.length / 6, N = y.length, dir = Math.sign(T);
  let t = 0, H = h0 ?? dir * Math.min(Math.abs(T), 1);
  const f0 = new Float64Array(N), tmp = new Float64Array(N);
  const tab = SEQ.map(() => new Float64Array(N));
  let steps = 0;
  while (dir * (T - t) > 0) {
    if (dir * (t + H - T) > 0) H = T - t;
    deriv(y, m, nb, f0);
    let accepted = false, kUsed = 0, err = 0;
    for (let k = 0; k < SEQ.length; k++) {
      midpoint(y, m, nb, H, SEQ[k], tab[k], f0, tmp);
      for (let j = k - 1; j >= 0; j--) {
        const r = (SEQ[k] / SEQ[j]) ** 2 - 1;
        for (let c = 0; c < N; c++) tab[j][c] = tab[j + 1][c] + (tab[j + 1][c] - tab[j][c]) / r;
      }
      // tab[0] now holds the highest-order estimate; tab[1] the next lower
      if (k >= 2) {
        err = errNorm(tab[0], tab[1], y, nb);
        if (err < tol) { accepted = true; kUsed = k; break; }
      }
    }
    if (!accepted) { H *= 0.4; continue; }
    y.set(tab[0]);
    t += H; steps += 1;
    if (onStep) onStep(t, y);
    const grow = err > 0 ? 0.9 * (tol / err) ** (1 / (2 * kUsed + 1)) : 4;
    H *= Math.min(4, Math.max(0.5, kUsed <= 4 ? grow * 1.5 : grow));
    if (steps > maxSteps) throw new Error('too many steps');
  }
  return steps;
}

/** Star, parent planet and flyby at closest approach (separation q, relative speed vq),
 * integrated back by tSim/2, as in exomoons.flyby_massive ("crossing" geometry). */
export function flybyStart({ q, vq, mp, tSim }) {
  const m = [M_STAR, mp, mp];
  const vc = Math.sqrt(G * (M_STAR + mp) / A_P);
  // REBOUND's add(m, a=30): parent on the x axis moving along +y, about the star
  const y = new Float64Array(18);
  y.set([0, 0, 0, 0, 0, 0], 0);
  y.set([A_P, 0, 0, 0, vc, 0], 6);
  y.set([A_P, q, 0, vq, vc, 0], 12);
  // move to the centre of mass
  const mt = m[0] + m[1] + m[2];
  for (let k = 0; k < 6; k++) { const c = (m[0] * y[k] + m[1] * y[6 + k] + m[2] * y[12 + k]) / mt; y[k] -= c; y[6 + k] -= c; y[12 + k] -= c; }
  integrate(y, m, -0.5 * tSim, { tol: 1e-13 });
  return { y, m };
}

/** Planetocentric state from orbital elements about mass mu = G M (au, au/day). */
export function elementsToState(mu, a, e, inc, Om, om, M) {
  let E = M;
  for (let k = 0; k < 50; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-15) break; }
  const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - e * e);
  const x = a * (cE - e), yy = a * b * sE;
  const n = Math.sqrt(mu / a ** 3), rdot = n * a / (1 - e * cE);
  const vx = -rdot * sE, vy = rdot * b * cE;
  const cO = Math.cos(Om), sO = Math.sin(Om), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(inc), si = Math.sin(inc);
  const P = [cO * co - sO * so * ci, sO * co + cO * so * ci, so * si];
  const Q = [-cO * so - sO * co * ci, -sO * so + cO * co * ci, co * si];
  return [0, 1, 2].map((k) => x * P[k] + yy * Q[k]).concat([0, 1, 2].map((k) => vx * P[k] + vy * Q[k]));
}

/** Draw moons as PVHG16 do (log-uniform a, uniform e and i, apocentre < 0.5 r_H), but
 * within aMin..aMax (fractions of r_H). rng() returns uniforms in [0, 1). */
export function sampleMoons(n, rH, rp, rng, aMin = null, aMax = 0.5) {
  const lo = Math.log(Math.max(aMin ? aMin * rH : rp, rp)), hi = Math.log(aMax * rH);
  const out = [];
  while (out.length < n) {
    const a = Math.exp(lo + (hi - lo) * rng()), e = rng();
    if (a * (1 - e) <= rp || a * (1 + e) >= 0.5 * rH) continue;
    out.push({ a, e, inc: Math.PI * rng(), Om: 2 * Math.PI * rng(), om: 2 * Math.PI * rng(), M: 2 * Math.PI * rng() });
  }
  return out;
}

/** Follow one moon through the encounter from the given massive start state. Returns
 * { bound, captured, aFinal, eFinal, steps } (bound: to the parent at the end), or
 * { unresolved: true } if the moon needs more than maxSteps steps (it happens for moons that
 * repeatedly pass very close to a planet, e.g. while being captured by the flyby planet). */
export function runMoon(start, moon, tSim, mp, { tol = 1e-12, maxSteps = 1e6 } = {}) {
  const y = new Float64Array(24);
  y.set(start.y);
  const s = elementsToState(G * mp, moon.a, moon.e, moon.inc, moon.Om, moon.om, moon.M);
  for (let k = 0; k < 6; k++) y[18 + k] = y[6 + k] + s[k];
  let steps;
  try {
    steps = integrate(y, start.m, tSim, { tol, maxSteps, h0: Math.min(tSim, 0.02 * 2 * Math.PI * Math.sqrt(moon.a ** 3 / (G * mp))) });
  } catch (err) {
    if (err.message !== 'too many steps') throw err;
    return { bound: false, captured: false, aFinal: NaN, eFinal: NaN, steps: maxSteps, unresolved: true };
  }
  const rH = hillRadius(A_P, 0, mp, M_STAR);
  const rel = (j) => { const r = [0, 1, 2].map((k) => y[18 + k] - y[6 * j + k]), v = [0, 1, 2].map((k) => y[21 + k] - y[6 * j + 3 + k]); return { r, v, rn: Math.hypot(...r) }; };
  const res = { bound: false, captured: false, aFinal: NaN, eFinal: NaN, steps };
  for (const j of [1, 2]) {
    const { r, v, rn } = rel(j);
    const v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, en = 0.5 * v2 - G * mp / rn;
    if (en < 0 && rn < rH) {
      if (j === 1) {
        res.bound = true;
        res.aFinal = -G * mp / (2 * en);
        const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
        res.eFinal = Math.sqrt(Math.max(0, 1 + 2 * en * (h[0] ** 2 + h[1] ** 2 + h[2] ** 2) / (G * mp) ** 2));
      } else res.captured = true;
      break;
    }
  }
  return res;
}

/** The flyby's path relative to the parent planet (au), sampled nOut times. */
export function flybyPath(c, nOut = 400) {
  const st = flybyStart(c);
  const y = Float64Array.from(st.y);
  const pts = [];
  for (let k = 0; k <= nOut; k++) {
    if (k) integrate(y, st.m, c.tSim / nOut, { tol: 1e-12 });
    pts.push([y[12] - y[6], y[13] - y[7], y[14] - y[8]]);
  }
  return pts;
}
