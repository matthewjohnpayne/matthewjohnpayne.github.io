// Physics for the TTV page: a port of the science-notebooks helper module
// (notebooks/ttv_inclined/ttv.py), which follows Payne, Ford & Veras (2010,
// ApJL 712, L86; "PFV10"): a transiting hot Jupiter perturbed by a companion
// on an inclined, possibly retrograde, orbit.
//
// Units: days, au and solar masses, with REBOUND's value of G. The transiting
// planet orbits in the x-y plane and the observer lies far away along +x. The
// notebook integrates with REBOUND's IAS15; this page uses a Wisdom-Holman map
// in Jacobi coordinates (validated against the notebook in tools/validate_ttv/).
// No dependencies, so the same module runs in the browser and in Node.

export const G = 0.00029591220828559104;      // au^3 / (Msun day^2), as REBOUND
export const C_AU_PER_DAY = 173.1446326846693;
export const M_JUP = 9.547919e-4;
export const M_EARTH = 3.003489e-6;
export const R_SUN_AU = 0.00465047;
export const DAY_S = 86400;
export const YEAR_D = 365.25;
export const A1 = 0.05;
export const T_END = 10 * YEAR_D;

/** Cartesian state [x, y, z, vx, vy, vz] of an orbit about gravitational
 *  parameter gm, from (a, e, inc, Omega, omega, M), angles in radians, with
 *  REBOUND's conventions. */
export function fromElements(gm, a, e, inc, Omega, omega, M) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 60; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-15) break;
  }
  const n = Math.sqrt(gm / a ** 3), b = a * Math.sqrt(1 - e * e), r = a * (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = b * Math.sin(E);
  const vxp = (-a * a * n * Math.sin(E)) / r, vyp = (a * b * n * Math.cos(E)) / r;
  const cO = Math.cos(Omega), sO = Math.sin(Omega), cw = Math.cos(omega), sw = Math.sin(omega);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
  const Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
  return [0, 1, 2].map((k) => P[k] * xp + Q[k] * yp).concat([0, 1, 2].map((k) => P[k] * vxp + Q[k] * vyp));
}

/**
 * Initial state as in the notebook's make_sim: star (mass 1), transiting planet
 * (m1, a1, e = 0, in the x-y plane) and companion (m2, a2 = aRatio a1, e2,
 * inc2, omega2, Omega2, M2). As in REBOUND, each orbit is about the centre of
 * mass of the bodies inside it (Jacobi coordinates).
 * Returns {m: [m0, m1, m2], y: Float64Array(12)}: Jacobi positions and
 * velocities of planet 1 (y[0..5]) and planet 2 (y[6..11]).
 */
export function initialState({ aRatio, e2, inc2, omega2 = 0, Omega2 = 0, M2 = 0, m1 = M_JUP, m2 = M_EARTH, a1 = A1 }) {
  const y = new Float64Array(12);
  y.set(fromElements(G * (1 + m1), a1, 0, 0, 0, 0, 0), 0);
  y.set(fromElements(G * (1 + m1 + m2), aRatio * a1, e2, inc2, Omega2, omega2, M2), 6);
  return { m: [1, m1, m2], y };
}

// Stumpff functions c0..c3 of x, written into out.
function stumpff(x, out) {
  if (Math.abs(x) < 1) {
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

const CS = new Float64Array(4);
/** Advance the Kepler orbit at y[o..o+5] about gravitational parameter gm by dt
 *  (universal variables; any orbit type). */
function keplerDrift(y, o, gm, dt) {
  const x0 = y[o], y0 = y[o + 1], z0 = y[o + 2], vx0 = y[o + 3], vy0 = y[o + 4], vz0 = y[o + 5];
  const r0 = Math.hypot(x0, y0, z0);
  const eta = x0 * vx0 + y0 * vy0 + z0 * vz0;
  const beta = (2 * gm) / r0 - (vx0 * vx0 + vy0 * vy0 + vz0 * vz0);
  let s = dt / r0, r = r0;
  for (let k = 0; k < 50; k++) {
    stumpff(beta * s * s, CS);
    const G1 = s * CS[1], G2 = s * s * CS[2], G3 = s * s * s * CS[3];
    r = r0 * CS[0] + eta * G1 + gm * G2;
    const ds = (r0 * G1 + eta * G2 + gm * G3 - dt) / r;
    s -= ds;
    if (Math.abs(ds) <= 1e-15 * Math.abs(s)) break;
  }
  stumpff(beta * s * s, CS);
  const G1 = s * CS[1], G2 = s * s * CS[2], G3 = s * s * s * CS[3];
  r = r0 * CS[0] + eta * G1 + gm * G2;
  const f = 1 - (gm * G2) / r0, g = dt - gm * G3;
  const fd = (-gm * G1) / (r * r0), gd = 1 - (gm * G2) / r;
  y[o] = f * x0 + g * vx0; y[o + 1] = f * y0 + g * vy0; y[o + 2] = f * z0 + g * vz0;
  y[o + 3] = fd * x0 + gd * vx0; y[o + 4] = fd * y0 + gd * vy0; y[o + 5] = fd * z0 + gd * vz0;
}

/** Wisdom-Holman step in Jacobi coordinates, drift-kick-drift, with the Kepler
 *  parts about G(m0 + m1) and G(m0 + m1 + m2). */
export function whStep(y, m, dt) {
  const [m0, m1, m2] = m, eta1 = m0 + m1, eta2 = eta1 + m2;
  keplerDrift(y, 0, G * eta1, dt / 2);
  keplerDrift(y, 6, G * eta2, dt / 2);
  // Interaction: the full potential minus the Kepler parts
  const d02 = [0, 1, 2].map((k) => y[6 + k] + (m1 / eta1) * y[k]);    // star to planet 2
  const d12 = [0, 1, 2].map((k) => y[6 + k] - (m0 / eta1) * y[k]);    // planet 1 to planet 2
  const r02 = Math.hypot(...d02), r12 = Math.hypot(...d12), r2 = Math.hypot(y[6], y[7], y[8]);
  const i02 = 1 / (r02 * r02 * r02), i12 = 1 / (r12 * r12 * r12), i2 = 1 / (r2 * r2 * r2);
  for (let k = 0; k < 3; k++) {
    y[3 + k] += G * dt * m2 * (d12[k] * i12 - d02[k] * i02);
    y[9 + k] += G * dt * eta2 * (y[6 + k] * i2 - (m0 * d02[k] * i02 + m1 * d12[k] * i12) / eta1);
  }
  keplerDrift(y, 0, G * eta1, dt / 2);
  keplerDrift(y, 6, G * eta2, dt / 2);
}

/** Barycentric positions and velocities of [star, planet 1, planet 2], each
 *  [x, y, z, vx, vy, vz], from the Jacobi state (centre of mass at rest at 0). */
export function barycentric(y, m) {
  const [m0, m1, m2] = m, eta1 = m0 + m1, eta2 = eta1 + m2;
  const out = [[], [], []];
  for (let k = 0; k < 6; k++) {
    const com01 = -(m2 / eta2) * y[6 + k];
    out[0][k] = com01 - (m1 / eta1) * y[k];
    out[1][k] = com01 + (m0 / eta1) * y[k];
    out[2][k] = (eta1 / eta2) * y[6 + k];
  }
  return out;
}

/** Osculating Jacobi period of planet 1. */
export function period1(y, m) {
  const gm = G * (m[0] + m[1]);
  const a = 1 / (2 / Math.hypot(y[0], y[1], y[2]) - (y[3] ** 2 + y[4] ** 2 + y[5] ** 2) / gm);
  return 2 * Math.PI * Math.sqrt(a ** 3 / gm);
}

/**
 * Mid-transit times of planet 1, as in PFV10 Section 2.1 and the notebook:
 * after each step, test whether the projected star-planet separation Delta (in
 * the y-z sky plane) has passed through a minimum with the planet in front of
 * the star; find the time of the minimum by Newton iteration on
 * d(Delta^2)/dt = 0, re-stepping from the start of the step; keep it if
 * Delta < rStar; add the light travel time -x_planet/c (barycentric).
 * onProgress(fraction) is called now and then. Returns a Float64Array.
 */
export function transitTimes(params, { tEnd = T_END, stepsPerOrbit = 60, rStar = R_SUN_AU, onProgress } = {}) {
  const { m, y } = initialState(params);
  const dt = period1(y, m) / stepsPerOrbit;
  const fOf = (b) => (b[1][1] - b[0][1]) * (b[1][4] - b[0][4]) + (b[1][2] - b[0][2]) * (b[1][5] - b[0][5]);
  const saved = new Float64Array(12), trial = new Float64Array(12);
  const times = [];
  let t = 0, b = barycentric(y, m), fOld = fOf(b), nextReport = 0.05;
  const nSteps = Math.ceil(tEnd / dt);
  for (let n = 0; n < nSteps; n++) {
    saved.set(y);
    whStep(y, m, dt);
    t += dt;
    b = barycentric(y, m);
    const fNew = fOf(b);
    if (fOld < 0 && fNew >= 0 && b[1][0] > b[0][0]) {
      let tau = (dt * -fOld) / (fNew - fOld), bt = b;
      for (let k = 0; k < 30; k++) {
        trial.set(saved);
        whStep(trial, m, tau);
        bt = barycentric(trial, m);
        const step = -fOf(bt) / ((bt[1][4] - bt[0][4]) ** 2 + (bt[1][5] - bt[0][5]) ** 2);
        tau += step;
        if (Math.abs(step) < 1e-11) break;
      }
      trial.set(saved);
      whStep(trial, m, tau);
      bt = barycentric(trial, m);
      const tt = t - dt + tau;
      if (Math.hypot(bt[1][1] - bt[0][1], bt[1][2] - bt[0][2]) < rStar && tt <= tEnd) times.push(tt - bt[1][0] / C_AU_PER_DAY);
    }
    fOld = fNew;
    if (onProgress && n / nSteps >= nextReport) { onProgress(n / nSteps); nextReport += 0.05; }
  }
  return Float64Array.from(times);
}

/** TTVs: residuals (in seconds) from a least-squares linear ephemeris, the
 *  fitted period (days) and the RMS (seconds). */
export function ttv(times) {
  const n = times.length;
  let s0 = 0, s1 = 0, s2 = 0, sy = 0, sty = 0;
  for (let i = 0; i < n; i++) { s0 += 1; s1 += i; s2 += i * i; sy += times[i]; sty += i * times[i]; }
  const det = s0 * s2 - s1 * s1;
  const P = (s0 * sty - s1 * sy) / det, t0 = (s2 * sy - s1 * sty) / det;
  const resid = Float64Array.from(times, (t, i) => (t - t0 - i * P) * DAY_S);
  let ss = 0;
  for (const r of resid) ss += r * r;
  return { resid, P, t0, rms: n ? Math.sqrt(ss / n) : NaN };
}

/** Gladman (1993) Hill stability for coplanar prograde orbits, orbital-element
 *  form, as in the notebook. */
export function gladmanHillStable(aRatio, e2, { e1 = 0, m1 = M_JUP, m2 = M_EARTH } = {}) {
  const mu = m1 + m2, lam = Math.sqrt(aRatio);
  const g1 = Math.sqrt(1 - e1 * e1), g2 = Math.sqrt(1 - e2 * e2);
  const lhs = mu ** -3 * (m1 + m2 / (lam * lam)) * (m1 * g1 + m2 * g2 * lam) ** 2;
  return lhs > 1 + (3 ** (4 / 3) * m1 * m2) / mu ** (4 / 3);
}
