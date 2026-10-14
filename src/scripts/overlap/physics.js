// Physics for the resonance-overlap page: a port of the science-notebooks
// helper module (notebooks/resonance_overlap/overlap.py), which follows
// Deck, Payne & Holman (2013, ApJ 774, 129; "DPH13").
//
// Units: G = 1 and stellar mass 1. The inner planet starts at a = 1, so its
// period is 2*pi. Both planets move in one plane. No dependencies, so the same
// module runs in the browser and in Node (tools/validate_overlap/).

export const TWO_PI = 2 * Math.PI;
export const DAYS_PER_YEAR = 365.25;

// --- Simple analytic criteria (DPH13 Section 3) --------------------------------

/** P2/P1 below which first-order resonances overlap, for circular orbits. */
export const overlapPeriodRatio = (eps) => 1 + 2.2 * eps ** (2 / 7);
/** (a2 - a1)/a1 below which first-order resonances overlap, for circular orbits. */
export const overlapDelta = (eps) => 1.46 * eps ** (2 / 7);
/** (a2 - a1)/a1 above which circular orbits are Hill stable (Gladman 1993). */
export const hillDelta = (eps) => 2.4 * eps ** (1 / 3);

// --- Separatrices of the reduced Hamiltonian (DPH13 Section 2) -----------------

// Largest root of X^3 - 2 G X + 2 = 0, which has three real roots for G > 3/2.
function saddle(G) {
  const p = -2 * G, q = 2;
  return 2 * Math.sqrt(-p / 3) * Math.cos(Math.acos(((3 * q) / (2 * p)) * Math.sqrt(-3 / p)) / 3);
}

/**
 * Separatrix of the m+1:m resonance in the plane of period ratio and weighted
 * eccentricity sigma, from H' = -1/2 [ (X^2+Y^2)/2 - Gamma' ]^2 - X.
 * Returns [inner, outer], each {pr: number[], sigma: number[]}, in averaged
 * period ratio. zeta = m1/m2.
 */
export function resonanceSeparatrix(eps, m, { zeta = 1, n = 600, gammaMax = 60 } = {}) {
  const f27 = -0.46 - 0.802 * m, f31 = 0.87 + 0.802 * m;   // DPH13 fits to the Laplace coefficients
  const R = Math.abs(f27 / f31);
  const aRes = (m / (m + 1)) ** (2 / 3);
  const Q = eps ** (2 / 3) * zeta * ((f31 ** 2) / (9 * (m + 1) * (1 + zeta) ** 2)) ** (1 / 3)
    * aRes ** (5 / 6) / m * ((R ** 2 + zeta * Math.sqrt(aRes)) / (aRes + zeta) ** 5) ** (1 / 3);
  const gM = zeta / (aRes + zeta) / (2 * (R ** 2 + zeta * Math.sqrt(aRes)));
  const curves = [];
  for (const sign of [1, -1]) {
    const pr = [], sigma = [];
    for (let k = 0; k < n; k++) {
      // Gamma' = 3/2 + a geometric sequence from 1e-4 to gammaMax
      const G = 1.5 + 1e-4 * (gammaMax / 1e-4) ** (k / (n - 1));
      const X3 = saddle(G);
      const Xs = -X3 + (sign * 2) / Math.sqrt(X3);
      const phi = (Xs * Xs) / 2;
      const dTheta = Q * (phi - G);
      const s = (zeta / m - dTheta * (aRes + zeta)) / (zeta / m + dTheta * zeta * (1 + zeta / aRes));
      pr.push((s * s * aRes) ** -1.5);
      sigma.push(Math.sqrt((Q * phi) / (gM * R * R)));
    }
    curves.push({ pr, sigma });
  }
  return curves;
}

// --- Two planets in Jacobi coordinates -------------------------------------------

/** Cartesian position and velocity (2D) of an orbit with semi-major axis a,
 *  eccentricity e and mean anomaly M, pericentre on the +x axis. */
function fromElements(mu, a, e, M) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-15) break;
  }
  const n = Math.sqrt(mu / a ** 3), b = a * Math.sqrt(1 - e * e);
  const r = a * (1 - e * Math.cos(E));
  return [a * (Math.cos(E) - e), b * Math.sin(E), (-a * a * n * Math.sin(E)) / r, (a * b * n * Math.cos(E)) / r];
}

/**
 * Initial state as in the notebook's two_planet_sim: total planet mass eps,
 * m1/m2 = massRatio; the inner planet at a = 1 with eccentricity e1 and mean
 * anomaly M1; the outer planet with period ratio pr, eccentricity e2, and all
 * other angles zero. As in REBOUND, each orbit is about the centre of mass of
 * the bodies inside it, so these are Jacobi coordinates.
 * Returns {m: [m0, m1, m2], y: Float64Array(8) = x1, y1, vx1, vy1, x2, y2, vx2, vy2}.
 */
export function twoPlanetState({ eps, pr, e1 = 0, e2 = 0, M1 = Math.PI / 2, massRatio = 1 }) {
  const m2 = eps / (1 + massRatio), m1 = eps - m2, m0 = 1;
  const mu1 = m0 + m1, mu2 = m0 + m1 + m2;
  const a2 = (mu2 * pr * pr) ** (1 / 3);   // P2 = 2 pi pr, P1 = 2 pi at a1 = 1 (to O(eps), as REBOUND)
  const y = new Float64Array(8);
  y.set(fromElements(mu1, 1, e1, M1), 0);
  y.set(fromElements(mu2, a2, e2, 0), 4);
  return { m: [m0, m1, m2], y };
}

// Stumpff functions c0..c3 of x, written into out.
function stumpff(x, out) {
  if (Math.abs(x) < 1) {
    // Series: c2 = sum (-x)^k/(2k+2)!, c3 = sum (-x)^k/(2k+3)!
    let c2 = 0, c3 = 0, t2 = 0.5, t3 = 1 / 6;
    for (let k = 0; k < 12; k++) {
      c2 += t2; c3 += t3;
      t2 *= -x / ((2 * k + 3) * (2 * k + 4));
      t3 *= -x / ((2 * k + 4) * (2 * k + 5));
    }
    out[0] = 1 - x * c2; out[1] = 1 - x * c3; out[2] = c2; out[3] = c3;
  } else if (x > 0) {
    const s = Math.sqrt(x);
    out[0] = Math.cos(s); out[1] = Math.sin(s) / s;
    out[2] = (1 - out[0]) / x; out[3] = (1 - out[1]) / x;
  } else {
    const s = Math.sqrt(-x);
    out[0] = Math.cosh(s); out[1] = Math.sinh(s) / s;
    out[2] = (1 - out[0]) / x; out[3] = (1 - out[1]) / x;
  }
}

const C = new Float64Array(4);
/** Advance the Kepler orbit at y[o..o+3] (x, y, vx, vy) about mass mu by dt,
 *  with universal variables. Works for any orbit type. */
function keplerDrift(y, o, mu, dt) {
  const x0 = y[o], y0 = y[o + 1], vx0 = y[o + 2], vy0 = y[o + 3];
  const r0 = Math.hypot(x0, y0);
  const eta = x0 * vx0 + y0 * vy0;
  const beta = (2 * mu) / r0 - (vx0 * vx0 + vy0 * vy0);
  let s = dt / r0, r = r0;
  for (let k = 0; k < 40; k++) {
    stumpff(beta * s * s, C);
    const G1 = s * C[1], G2 = s * s * C[2], G3 = s * s * s * C[3];
    r = r0 * C[0] + eta * G1 + mu * G2;
    const ds = (r0 * G1 + eta * G2 + mu * G3 - dt) / r;
    s -= ds;
    if (Math.abs(ds) <= 1e-15 * Math.abs(s)) break;
  }
  stumpff(beta * s * s, C);
  const G1 = s * C[1], G2 = s * s * C[2], G3 = s * s * s * C[3];
  r = r0 * C[0] + eta * G1 + mu * G2;
  const f = 1 - (mu * G2) / r0, g = dt - mu * G3;
  const fd = (-mu * G1) / (r * r0), gd = 1 - (mu * G2) / r;
  y[o] = f * x0 + g * vx0; y[o + 1] = f * y0 + g * vy0;
  y[o + 2] = fd * x0 + gd * vx0; y[o + 3] = fd * y0 + gd * vy0;
}

/** Wisdom-Holman (WHFast) step in Jacobi coordinates, drift-kick-drift,
 *  with the Kepler parts about masses eta1 = m0+m1 and eta2 = m0+m1+m2. */
function whStep(y, m, dt) {
  const [m0, m1, m2] = m, eta1 = m0 + m1, eta2 = eta1 + m2;
  keplerDrift(y, 0, eta1, dt / 2);
  keplerDrift(y, 4, eta2, dt / 2);
  // Interaction: the full potential minus the Kepler parts.
  const x1 = y[0], y1 = y[1], x2 = y[4], y2 = y[5];
  const dx02 = x2 + (m1 / eta1) * x1, dy02 = y2 + (m1 / eta1) * y1;   // star to planet 2
  const dx12 = x2 - (m0 / eta1) * x1, dy12 = y2 - (m0 / eta1) * y1;   // planet 1 to planet 2
  const r02 = Math.hypot(dx02, dy02), r12 = Math.hypot(dx12, dy12), r2 = Math.hypot(x2, y2);
  const i02 = 1 / (r02 * r02 * r02), i12 = 1 / (r12 * r12 * r12), i2 = 1 / (r2 * r2 * r2);
  y[2] += dt * m2 * (dx12 * i12 - dx02 * i02);
  y[3] += dt * m2 * (dy12 * i12 - dy02 * i02);
  y[6] += dt * eta2 * (x2 * i2 - (m0 * dx02 * i02 + m1 * dx12 * i12) / eta1);
  y[7] += dt * eta2 * (y2 * i2 - (m0 * dy02 * i02 + m1 * dy12 * i12) / eta1);
  keplerDrift(y, 0, eta1, dt / 2);
  keplerDrift(y, 4, eta2, dt / 2);
}

/** Osculating Jacobi periods [P1, P2] (NaN if unbound). */
export function periods(y, m) {
  const eta1 = m[0] + m[1], eta2 = eta1 + m[2];
  const P = (o, mu) => {
    const a = 1 / (2 / Math.hypot(y[o], y[o + 1]) - (y[o + 2] ** 2 + y[o + 3] ** 2) / mu);
    return a > 0 ? TWO_PI * Math.sqrt((a * a * a) / mu) : NaN;
  };
  return [P(0, eta1), P(4, eta2)];
}

/** Total energy and angular momentum about the centre of mass. */
export function energyAndMomentum(y, m) {
  const [m0, m1, m2] = m, eta1 = m0 + m1, eta2 = eta1 + m2;
  const mu1 = (m1 * m0) / eta1, mu2 = (m2 * eta1) / eta2;    // Jacobi reduced masses
  const kin = 0.5 * mu1 * (y[2] ** 2 + y[3] ** 2) + 0.5 * mu2 * (y[6] ** 2 + y[7] ** 2);
  const r01 = Math.hypot(y[0], y[1]);
  const r02 = Math.hypot(y[4] + (m1 / eta1) * y[0], y[5] + (m1 / eta1) * y[1]);
  const r12 = Math.hypot(y[4] - (m0 / eta1) * y[0], y[5] - (m0 / eta1) * y[1]);
  const E = kin - (m0 * m1) / r01 - (m0 * m2) / r02 - (m1 * m2) / r12;
  const L = mu1 * (y[0] * y[3] - y[1] * y[2]) + mu2 * (y[4] * y[7] - y[5] * y[6]);
  return { E, L };
}

// --- Hill stability (Marchal & Bozis 1982; Gladman 1993) -----------------------

/** Gladman's (1993, eq. 21) Hill-stability quantity divided by its critical
 *  value, minus one. Positive means Hill stable. */
export function hillMargin(state) {
  const [m0, m1, m2] = state.m, M = m0 + m1 + m2, Ms = m0 * m1 + m0 * m2 + m1 * m2;
  const u1 = m1 / m0, u2 = m2 / m0;
  const { E, L } = energyAndMomentum(state.y, state.m);
  const lhs = ((-2 * M) / Ms ** 3) * L * L * E;
  const crit = 1 + (3 ** (4 / 3) * u1 * u2) / (u1 + u2) ** (4 / 3) - (u1 * u2 * (11 * u1 + 7 * u2)) / (3 * (u1 + u2) ** 2);
  return lhs / crit - 1;
}

/** Smallest initial period ratio at which the pair is Hill stable, by bisection. */
export function hillPeriodRatio(eps, { e1 = 0, M1 = Math.PI / 2, lo = 1.0005, hi = 2.5 } = {}) {
  for (let k = 0; k < 50; k++) {
    const mid = 0.5 * (lo + hi);
    if (hillMargin(twoPlanetState({ eps, pr: mid, e1, M1 })) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// --- Lyapunov time (DPH13 Section 4) --------------------------------------------

// Small, reproducible pseudo-random numbers (mulberry32), so a run is repeatable.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const D0 = 1e-9;          // size of the separation between the two trajectories
const D_MAX = 1e-6;       // renormalise once it has grown past this
const EXIT = 20;          // escape distance, as in the notebook

/**
 * log10 of the Lyapunov time in units of the initial inner period, as in the
 * notebook's lyapunov_time. The outer period is one year and the run lasts
 * tDays days; T_Ly = t_final / ln(d), where d is the growth of a small random
 * separation from a second, shadow trajectory, renormalised whenever it grows
 * past 1e-6 so that it follows the linearised (tangent) dynamics. The notebook
 * integrates the variational equations instead; both measure the same growth.
 *
 * Returns +Infinity if the separation did not grow, and -Infinity if a planet
 * escaped or the orbit became unbound (certainly chaotic).
 *
 * With onSample, it is called nSamples+1 times with
 * {t (inner orbits), lnD, pr (osculating P2/P1)}.
 */
export function lyapunovTime({ eps, pr, e1 = 0, M1 = Math.PI / 2, tDays = 1e6, stepsPerOrbit = 50,
  seed = 1, onSample = null, nSamples = 300 }) {
  const state = twoPlanetState({ eps, pr, e1, M1 });
  const { m } = state, y = state.y, z = new Float64Array(8);
  const rnd = random(seed);
  let norm = 0;
  for (let k = 0; k < 8; k++) {
    // Box-Muller normal deviates for a direction uniform on the sphere
    z[k] = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TWO_PI * rnd());
    norm += z[k] * z[k];
  }
  norm = Math.sqrt(norm);
  for (let k = 0; k < 8; k++) z[k] = y[k] + (D0 * z[k]) / norm;

  const dt = TWO_PI / stepsPerOrbit;
  const tFinal = (TWO_PI * pr * tDays) / DAYS_PER_YEAR;
  const nSteps = Math.ceil(tFinal / dt);
  const every = Math.max(1, Math.floor(nSteps / nSamples));
  let lnD = 0;
  const separation = () => {
    let s = 0;
    for (let k = 0; k < 8; k++) s += (z[k] - y[k]) ** 2;
    return Math.sqrt(s);
  };
  const sample = (step) => {
    const [P1, P2] = periods(y, m);
    onSample({ t: (step * dt) / TWO_PI, lnD: lnD + Math.log(separation() / D0), pr: P2 / P1 });
  };
  if (onSample) sample(0);
  for (let step = 1; step <= nSteps; step++) {
    whStep(y, m, dt);
    whStep(z, m, dt);
    const d = separation();
    if (d > D_MAX) {
      lnD += Math.log(d / D0);
      for (let k = 0; k < 8; k++) z[k] = y[k] + ((z[k] - y[k]) * D0) / d;
    }
    if (step % 64 === 0 || step === nSteps) {
      // Escape, or an orbit no longer bound: certainly chaotic.
      const rr = Math.hypot(y[4], y[5]);
      if (!(rr < EXIT) || !(Math.hypot(y[0], y[1]) < EXIT) || !Number.isFinite(d)) {
        if (onSample) sample(step);
        return -Infinity;
      }
    }
    if (onSample && step % every === 0) sample(step);
  }
  lnD += Math.log(separation() / D0);
  if (!Number.isFinite(lnD)) return -Infinity;
  if (lnD <= 0) return Infinity;
  return Math.log10(tFinal / lnD / TWO_PI);
}
