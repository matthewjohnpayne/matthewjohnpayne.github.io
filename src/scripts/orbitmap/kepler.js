// Two-body (Keplerian) positions for the asteroid-belt orbit map (src/pages/teaching/asteroid-belt.astro).
// The data are MPCORB osculating heliocentric ecliptic elements at the catalogue epoch, written by
// tools/export_orbit_map.py; each orbit is propagated about the Sun alone, as in Step 8 of the MPC
// tutorial "Plotting Asteroid Orbits". Used in the browser and by tools/validate_orbit_map/compare.mjs.

const DEG = Math.PI / 180;

// Decode belt.bin (float32 a[N], then uint16 e, i, node, peri, M) into per-orbit constants:
// position = A (cos E - e) + B sin E, with A = a P and B = a sqrt(1 - e^2) Q projected on the
// ecliptic (x, y), mean motion n (rad/yr) and mean anomaly M0 at the epoch.
export function decodeBelt(buffer, meta) {
  const N = meta.counts.total;
  const a = new Float32Array(buffer, 0, N);
  const u = new Uint16Array(buffer, 4 * N, 5 * N);
  const s = meta.scales, k = meta.gaussK * 365.25;
  const orbits = {
    N, a: Float64Array.from(a), e: new Float64Array(N), M0: new Float64Array(N), n: new Float64Array(N),
    Ax: new Float64Array(N), Ay: new Float64Array(N), Bx: new Float64Array(N), By: new Float64Array(N),
    cls: new Uint8Array(N)   // 0 other, 1 Hilda band, 2 Trojan band (by semi-major axis, as in the tutorial)
  };
  const { hilda, trojan } = meta.bands;
  for (let j = 0; j < N; j++) {
    const aj = a[j];
    const e = (u[j] / 65535) * s.e;
    const inc = (u[N + j] / 65535) * s.i * DEG;
    const W = (u[2 * N + j] / 65535) * s.node * DEG;
    const w = (u[3 * N + j] / 65535) * s.peri * DEG;
    orbits.M0[j] = (u[4 * N + j] / 65535) * s.M * DEG;
    orbits.e[j] = e;
    orbits.n[j] = k / Math.pow(aj, 1.5);
    const cW = Math.cos(W), sW = Math.sin(W), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(inc);
    const b = aj * Math.sqrt(1 - e * e);
    orbits.Ax[j] = aj * (cW * cw - sW * sw * ci);
    orbits.Ay[j] = aj * (sW * cw + cW * sw * ci);
    orbits.Bx[j] = b * (-cW * sw - sW * cw * ci);
    orbits.By[j] = b * (-sW * sw + cW * cw * ci);
    orbits.cls[j] = aj >= trojan[0] && aj <= trojan[1] ? 2 : aj >= hilda[0] && aj <= hilda[1] ? 1 : 0;
  }
  return orbits;
}

// Solve Kepler's equation E - e sin E = M (Newton's method; converges for all e < 1).
export function eccentricAnomaly(M, e) {
  M = M % (2 * Math.PI);
  let E = e < 0.8 ? M : Math.PI * Math.sign(Math.sin(M) || 1);
  for (let it = 0; it < 30; it++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

// Ecliptic (x, y) in au of every orbit, t years after the epoch, into out (Float32Array of 2N).
// For speed when playing, the eccentric anomaly E and its cosine and sine from the previous call
// are kept: Newton's method starts from a first-order step, and after each Newton correction d
// the cosine and sine are rotated by d (series to d^3) instead of recomputed, so a frame costs
// about one sine-cosine pair per orbit. Angles are not wrapped, so E stays continuous with M.
// Tolerance 1e-9 rad (about 0.5 km at 3 au).
export function positions(orbits, t, out) {
  const { N, e, M0, n, Ax, Ay, Bx, By } = orbits;
  if (!orbits.Ec) { orbits.Ec = new Float64Array(N); orbits.Cc = new Float64Array(N); orbits.Sc = new Float64Array(N); orbits.tCache = NaN; }
  const { Ec, Cc, Sc } = orbits, dt = t - orbits.tCache, warm = Math.abs(dt) < 0.5;
  for (let j = 0; j < N; j++) {
    const ej = e[j], M = M0[j] + n[j] * t;
    let E, cE, sE;
    if (warm) {
      E = Ec[j] + (n[j] * dt) / (1 - ej * Cc[j]);
      cE = Math.cos(E); sE = Math.sin(E);
      for (let it = 0; it < 20; it++) {
        const d = (E - ej * sE - M) / (1 - ej * cE);
        E -= d;
        if (d > 0.3 || d < -0.3) { cE = Math.cos(E); sE = Math.sin(E); continue; }
        const cd = 1 - 0.5 * d * d, sd = d - (d * d * d) / 6;
        const c2 = cE * cd + sE * sd;
        sE = sE * cd - cE * sd; cE = c2;
        if (d < 1e-9 && d > -1e-9) break;
      }
    } else {
      const k = Math.floor(M / (2 * Math.PI)) * 2 * Math.PI;   // keep E continuous with the unwrapped M
      E = eccentricAnomaly(M - k, ej) + k;
      cE = Math.cos(E); sE = Math.sin(E);
    }
    Ec[j] = E; Cc[j] = cE; Sc[j] = sE;
    const c = cE - ej;
    out[2 * j] = Ax[j] * c + Bx[j] * sE;
    out[2 * j + 1] = Ay[j] * c + By[j] * sE;
  }
  orbits.tCache = t;
  return out;
}

// A planet from its heliocentric elements (degrees; mean motion in deg/day): position t years
// after the epoch, its mean longitude, and points along its orbit for drawing.
export function planet(el) {
  const W = el.node * DEG, w = el.peri * DEG, inc = el.i * DEG, e = el.e, a = el.a;
  const cW = Math.cos(W), sW = Math.sin(W), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(inc);
  const b = a * Math.sqrt(1 - e * e);
  const A = [a * (cW * cw - sW * sw * ci), a * (sW * cw + cW * sw * ci)];
  const B = [b * (-cW * sw - sW * cw * ci), b * (-sW * sw + cW * cw * ci)];
  const n = el.n_deg_per_day * DEG * 365.25;   // rad/yr
  const at = (E) => [A[0] * (Math.cos(E) - e) + B[0] * Math.sin(E), A[1] * (Math.cos(E) - e) + B[1] * Math.sin(E)];
  return {
    name: el.name, n,
    position: (t) => at(eccentricAnomaly(el.M * DEG + n * t, e)),
    meanLongitude: (t) => (el.node + el.peri + el.M) * DEG + n * t,
    path: (k = 180) => Array.from({ length: k + 1 }, (_, j) => at((2 * Math.PI * j) / k))
  };
}

// Mean-motion resonances with Jupiter: an asteroid making p orbits for every q of Jupiter's has
// period P_J q / p, so by Kepler's third law a = a_J (q / p)^(2/3).
export const RESONANCES = [[4, 1], [3, 1], [5, 2], [7, 3], [2, 1], [3, 2], [1, 1]];
export const resonanceA = (aJ, p, q) => aJ * Math.pow(q / p, 2 / 3);
