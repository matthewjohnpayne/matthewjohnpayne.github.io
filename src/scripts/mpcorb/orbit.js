// Reading mpc_orb.json files (https://github.com/Smithsonian/mpc-public/tree/main/mpc_orb) and
// doing two-body orbital mechanics with them: element conversions, sampling from the
// covariance, and Kepler propagation with universal variables. The Cartesian state (CAR) is
// heliocentric, ecliptic J2000, in au and au/day, with GM = k^2 (Gaussian gravitational
// constant), which reproduces the files' cometary elements to about 1e-11.
// Validated against REBOUND and NumPy by tools/validate_mpcorb/.

export const K_GAUSS = 0.01720209895, GM = K_GAUSS * K_GAUSS;
export const AU_KM = 149597870.7;
const DEG = Math.PI / 180;

/** Accept either a bare mpc_orb object or a get-orb API response; throw with a readable message. */
export function unwrap(json) {
  let o = json;
  if (Array.isArray(o)) o = o[0];
  if (o && Array.isArray(o.mpc_orb)) o = o.mpc_orb[0];
  if (!o || typeof o !== 'object') throw new Error('This does not look like an mpc_orb file: no orbit found.');
  const missing = ['CAR', 'epoch_data', 'designation_data'].filter((k) => !o[k]);
  if (missing.length) throw new Error(`This does not look like an mpc_orb file: missing ${missing.join(', ')}.`);
  const c = o.CAR;
  if (!Array.isArray(c.coefficient_values) || c.coefficient_values.length < 6) throw new Error('The CAR block needs at least six coefficient values.');
  if (o.epoch_data.timeform !== 'MJD') throw new Error(`Epochs in ${o.epoch_data.timeform} are not supported here (MJD only).`);
  return o;
}

/** One representation (CAR, COM or KEP): names, values, uncertainties and the full covariance matrix. */
export function block(o, rep) {
  const b = o[rep];
  if (!b) return null;
  const n = b.coefficient_names.length;
  const C = Array.from({ length: n }, () => new Float64Array(n));
  let hasCov = !!b.covariance;
  for (let i = 0; i < n && hasCov; i++) for (let j = i; j < n; j++) {
    const v = b.covariance[`cov${i}${j}`];
    if (typeof v !== 'number') { hasCov = false; break; }
    C[i][j] = C[j][i] = v;
  }
  return { names: b.coefficient_names, values: b.coefficient_values, unc: b.coefficient_uncertainties, C: hasCov ? C : null, n };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot3(a, a));
const wrap360 = (x) => ((x % 360) + 360) % 360;

/** Heliocentric state -> cometary (q, e, i, node, argperi, peri_time) and Keplerian (a, e, i,
 *  node, argperi, mean_anomaly) elements, angles in degrees, times in MJD (TDT). */
export function stateToElements(s, epoch) {
  const r = s.slice(0, 3), v = s.slice(3, 6);
  const rn = norm(r), h = cross(r, v), hn = norm(h);
  const ev = cross(v, h).map((c, k) => c / GM - r[k] / rn), e = norm(ev);
  const a = 1 / (2 / rn - dot3(v, v) / GM);
  const p = (hn * hn) / GM, q = p / (1 + e);
  const inc = Math.acos(h[2] / hn);
  const node = Math.atan2(h[0], -h[1]);
  const nd = [Math.cos(node), Math.sin(node), 0], m = cross(h, nd).map((c) => c / hn);
  const argp = Math.atan2(dot3(ev, m), dot3(ev, nd));
  const f = Math.atan2(dot3(r, m), dot3(r, nd)) - argp;
  let M, tp;
  if (e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(f / 2));
    M = E - e * Math.sin(E);
    tp = epoch - M / Math.sqrt(GM / a ** 3);
  } else {
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(f / 2));
    M = e * Math.sinh(H) - H;
    tp = epoch - M / Math.sqrt(GM / (-a) ** 3);
  }
  return {
    COM: [q, e, inc / DEG, wrap360(node / DEG), wrap360(argp / DEG), tp],
    KEP: e < 1 ? [a, e, inc / DEG, wrap360(node / DEG), wrap360(argp / DEG), wrap360(M / DEG)] : null
  };
}

// Stumpff functions c2(z), c3(z), with series near z = 0.
function stumpff(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * z)]; }
  if (z < -1e-6) { const s = Math.sqrt(-z); return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * -z)]; }
  return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
}

/** Two-body propagation of a heliocentric state by dt days (universal variables, f and g). */
export function propagate(s, dt) {
  if (dt === 0) return s.slice(0, 6);
  const r0 = s.slice(0, 3), v0 = s.slice(3, 6);
  const r0n = norm(r0), vr0 = dot3(r0, v0) / r0n, sq = Math.sqrt(GM);
  const alpha = 2 / r0n - dot3(v0, v0) / GM;
  // Starting guess (Vallado), then Newton on the universal Kepler equation
  let x = alpha > 1e-9 ? sq * dt * alpha
    : Math.sign(dt) * Math.sqrt(-1 / alpha) * Math.log((-2 * GM * alpha * dt) / (dot3(r0, v0) + Math.sign(dt) * Math.sqrt(-GM / alpha) * (1 - r0n * alpha)));
  if (!Number.isFinite(x)) x = sq * dt / r0n;
  let c2, c3, rn;
  for (let it = 0; it < 60; it++) {
    const z = alpha * x * x;
    [c2, c3] = stumpff(z);
    const F = (r0n * vr0 / sq) * x * x * c2 + (1 - alpha * r0n) * x ** 3 * c3 + r0n * x - sq * dt;
    rn = x * x * c2 + (r0n * vr0 / sq) * x * (1 - z * c3) + r0n * (1 - z * c2);
    const dx = F / rn;
    x -= dx;
    if (Math.abs(dx) < 1e-13 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x;
  [c2, c3] = stumpff(z);
  const f = 1 - (x * x / r0n) * c2, g = dt - (x ** 3 / sq) * c3;
  const r = r0.map((c, k) => f * c + g * v0[k]);
  rn = norm(r);
  const fd = (sq / (rn * r0n)) * x * (z * c3 - 1), gd = 1 - (x * x / rn) * c2;
  return [...r, ...r0.map((c, k) => fd * c + gd * v0[k])];
}

/** Lower-triangular Cholesky factor of a symmetric positive-definite matrix (null if not). */
export function cholesky(C) {
  const n = C.length, L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = C[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}

/** A seeded random number generator with Gaussian deviates. */
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
}

/** n states drawn from the Gaussian described by the CAR block (only its first six parameters,
 *  i.e. the non-gravitational parameters are marginalised over). */
export function sampleStates(car, n, seed = 1) {
  const C6 = car.C.slice(0, 6).map((row) => row.slice(0, 6));
  const L = cholesky(C6);
  if (!L) return null;
  const g = rng(seed), out = [];
  for (let k = 0; k < n; k++) {
    const z = Array.from({ length: 6 }, g);
    out.push(car.values.slice(0, 6).map((v, i) => { let s = v; for (let j = 0; j <= i; j++) s += L[i][j] * z[j]; return s; }));
  }
  return out;
}

/** Offsets of states from a nominal one in its radial / along-track / cross-track frame (km). */
export function rtn(nominal, states) {
  const r = nominal.slice(0, 3), v = nominal.slice(3, 6);
  const R = r.map((c) => c / norm(r)), N = cross(r, v), Nn = norm(N);
  const Nh = N.map((c) => c / Nn), T = cross(Nh, R);
  return states.map((s) => { const d = [0, 1, 2].map((k) => (s[k] - r[k]) * AU_KM); return [dot3(d, R), dot3(d, T), dot3(d, Nh)]; });
}

/** Correlation matrix from a covariance matrix. */
export const correlation = (C) => C.map((row, i) => Array.from(row, (c, j) => c / Math.sqrt(C[i][i] * C[j][j])));

/** MJD (TT) to a calendar date string, ignoring the ~1 minute between TT and UTC. */
export function mjdToDate(mjd) {
  const d = new Date(Date.UTC(1858, 10, 17) + mjd * 86400000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
