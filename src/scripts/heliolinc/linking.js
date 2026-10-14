// HelioLinC for the interactive page: a port of the science-notebooks helper
// module (notebooks/heliolinc/heliolinc.py), which follows Holman, Payne,
// Blankley, Janssen & Kuindersma (2018, AJ 156, 135; "H18") and the formalism
// of Bernstein & Khushalani (2000, AJ 120, 3323).
//
// Units: au, days and radians; heliocentric ecliptic J2000 coordinates. No
// dependencies, so the same module runs in the browser and in Node
// (tools/validate_heliolinc/).

export const K_GAUSS = 0.01720209895;
export const GM_SUN = K_GAUSS * K_GAUSS;
export const C_AU_PER_DAY = 173.1446326846693;
export const ARCSEC = Math.PI / 180 / 3600;
const OBLIQUITY = (23.4392911 * Math.PI) / 180;
const J2000 = 2451545.0;
const COS_EPS = Math.cos(OBLIQUITY), SIN_EPS = Math.sin(OBLIQUITY);

// --- Geometry ---------------------------------------------------------------------

/** Approximate heliocentric ecliptic position of the Earth-Moon barycentre
 *  (Standish & Williams, JPL "Approximate Positions of the Planets", Table 1). */
export function earthPosition(jd) {
  const T = (jd - J2000) / 36525;
  const a = 1.00000261 + 0.00000562 * T;
  const e = 0.01671123 - 0.00004392 * T;
  const inc = ((-0.00001531 - 0.01294668 * T) * Math.PI) / 180;
  const L = ((100.46457166 + 35999.37244981 * T) * Math.PI) / 180;
  const varpi = ((102.93768193 + 0.32327364 * T) * Math.PI) / 180;
  const M = (((L - varpi) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = M;
  for (let k = 0; k < 60; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(varpi), sw = Math.sin(varpi), ci = Math.cos(inc), si = Math.sin(inc);
  return [cw * xp - sw * yp, (sw * xp + cw * yp) * ci, (sw * xp + cw * yp) * si];
}

/** Ecliptic unit vector of the direction RA, Dec (radians, equatorial J2000). */
export function eclipticUnit(ra, dec) {
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return [x, COS_EPS * y + SIN_EPS * z, -SIN_EPS * y + COS_EPS * z];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/** H18 frame: z toward the reference direction, x along increasing ecliptic
 *  longitude, y completing a right-handed set. Rows x, y, z. */
export function referenceFrame(zDir) {
  const z = zDir.map((v) => v / norm(zDir));
  let x = cross([0, 0, 1], z);
  const nx = norm(x);
  x = x.map((v) => v / nx);
  return [x, cross(z, x), z];
}

/** H18 Appendix, Eqs. (A1)-(A4): heliocentric position seen along unit vector u
 *  from observer position R, at assumed heliocentric distance r (null if none). */
export function heliocentricFromTopocentric(u, R, r) {
  const robs = norm(R);
  const cosf = -dot(u, R) / robs;
  const disc = r * r - robs * robs * (1 - cosf * cosf);
  if (disc < 0) return null;
  const rho = robs * cosf + Math.sqrt(disc);
  if (!(rho > 0)) return null;
  return [R[0] + rho * u[0], R[1] + rho * u[1], R[2] + rho * u[2]];
}

// --- The H18 transformation -------------------------------------------------------

/**
 * Detections are {jd: Float64Array, ra, dec: Float64Array (radians),
 * tracklet: Int32Array} with each tracklet's detections consecutive.
 * prepare() computes what depends only on the observations, gamma and the
 * reference direction (by default the mean heliocentric direction of the
 * detections at distance 1/gamma, as in the notebook).
 */
export function prepare(det, tRef, gamma, zDir = null) {
  const n = det.jd.length;
  const u = new Array(n), RE = new Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = eclipticUnit(det.ra[i], det.dec[i]);
    RE[i] = earthPosition(det.jd[i]);
  }
  if (!zDir) {
    const s = [0, 0, 0];
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      const h = heliocentricFromTopocentric(u[i], RE[i], 1 / gamma);
      if (!h) continue;
      const nh = norm(h);
      s[0] += h[0] / nh; s[1] += h[1] / nh; s[2] += h[2] / nh; cnt++;
    }
    zDir = s.map((v) => v / cnt);
  }
  const F = referenceFrame(zDir);
  const thx = new Float64Array(n), thy = new Float64Array(n), t = new Float64Array(n);
  const ex = new Float64Array(n), ey = new Float64Array(n), ez = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const uz = dot(u[i], F[2]);
    thx[i] = dot(u[i], F[0]) / uz;
    thy[i] = dot(u[i], F[1]) / uz;
    ex[i] = dot(RE[i], F[0]); ey[i] = dot(RE[i], F[1]); ez[i] = dot(RE[i], F[2]);
    t[i] = det.jd[i] - tRef;
  }
  return { tracklet: det.tracklet, nTracklets: det.tracklet[n - 1] + 1, thx, thy, ex, ey, ez, t, frame: F, gamma };
}

/** Right-hand sides of H18 Eq. (6) for every detection: its position in the
 *  heliocentric tangent plane, with gravity option 2 (g_z = -sigma t^2 / 2). */
export function heliocentricTangent(p, gammaDot, gravity = true) {
  const g = p.gamma, n = p.t.length;
  const sigma = GM_SUN * g * g * g;
  const hx = new Float64Array(n), hy = new Float64Array(n), tp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = p.t[i] - 1 / (C_AU_PER_DAY * g);         // H18: t' ~ t - 1/(c gamma)
    const gz = gravity ? -0.5 * sigma * t * t : 0;
    const bracket = 1 + gammaDot * t + g * gz - g * p.ez[i];
    hx[i] = p.thx[i] * bracket + g * p.ex[i];
    hy[i] = p.thy[i] * bracket + g * p.ey[i];
    tp[i] = t;
  }
  return { hx, hy, tp };
}

/** H18 Eq. (6) fitted by least squares per tracklet. Returns a Float64Array of
 *  4 * nTracklets: alpha, beta, alpha_dot, beta_dot for each tracklet. */
export function fitArrows(p, gammaDot, gravity = true) {
  const { hx, hy, tp } = heliocentricTangent(p, gammaDot, gravity);
  const m = p.nTracklets;
  const S = new Float64Array(m * 7);                    // S0, S1, S2, Sx, Stx, Sy, Sty
  for (let i = 0; i < tp.length; i++) {
    const k = p.tracklet[i] * 7, t = tp[i];
    S[k] += 1; S[k + 1] += t; S[k + 2] += t * t;
    S[k + 3] += hx[i]; S[k + 4] += t * hx[i]; S[k + 5] += hy[i]; S[k + 6] += t * hy[i];
  }
  const out = new Float64Array(m * 4);
  for (let j = 0; j < m; j++) {
    const k = j * 7, S0 = S[k], S1 = S[k + 1], S2 = S[k + 2];
    const det = S0 * S2 - S1 * S1;
    out[4 * j] = (S2 * S[k + 3] - S1 * S[k + 4]) / det;
    out[4 * j + 2] = (S0 * S[k + 4] - S1 * S[k + 3]) / det;
    out[4 * j + 1] = (S2 * S[k + 5] - S1 * S[k + 6]) / det;
    out[4 * j + 3] = (S0 * S[k + 6] - S1 * S[k + 5]) / det;
  }
  return out;
}

/** RMS distance of a set of arrows from their centroid, in the H18 metric. */
export function metricSpread(arrows, dt) {
  const m = arrows.length / 4;
  const c = [0, 0, 0, 0];
  for (let j = 0; j < m; j++) { c[0] += arrows[4 * j]; c[1] += arrows[4 * j + 1]; c[2] += dt * arrows[4 * j + 2]; c[3] += dt * arrows[4 * j + 3]; }
  for (let q = 0; q < 4; q++) c[q] /= m;
  let s = 0;
  for (let j = 0; j < m; j++) {
    s += (arrows[4 * j] - c[0]) ** 2 + (arrows[4 * j + 1] - c[1]) ** 2
      + (dt * arrows[4 * j + 2] - c[2]) ** 2 + (dt * arrows[4 * j + 3] - c[3]) ** 2;
  }
  return Math.sqrt(s / m);
}

// --- Clustering (H18 Section 3.1.3, Eq. 11) ---------------------------------------

/**
 * For each arrow, all arrows within distance d under the H18 metric
 * d^2 = dalpha^2 + dbeta^2 + dt^2 (dalpha_dot^2 + dbeta_dot^2), kept when there
 * are at least minSize. Neighbours are found through a grid of cells of side d
 * in (alpha, beta), which gives the same neighbours as a KD-tree. Adds each
 * cluster, as a sorted Int32Array of tracklet indices, to the Map `into`
 * (keyed by its member list) and returns it.
 */
export function findClusters(arrows, d, dt, minSize = 3, into = new Map()) {
  const m = arrows.length / 4;
  const cells = new Map();
  const key = (ix, iy) => ix * 1048576 + iy;
  const ix = new Int32Array(m), iy = new Int32Array(m);
  for (let j = 0; j < m; j++) {
    const a = arrows[4 * j], b = arrows[4 * j + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { ix[j] = 2e9; continue; }
    ix[j] = Math.floor(a / d) + 524288; iy[j] = Math.floor(b / d) + 524288;
    const k = key(ix[j], iy[j]);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = []));
    c.push(j);
  }
  const d2 = d * d, dt2 = dt * dt;
  const nb = [];
  for (let j = 0; j < m; j++) {
    if (ix[j] === 2e9) continue;
    nb.length = 0;
    const a = arrows[4 * j], b = arrows[4 * j + 1], ad = arrows[4 * j + 2], bd = arrows[4 * j + 3];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = cells.get(key(ix[j] + dx, iy[j] + dy));
        if (!c) continue;
        for (const q of c) {
          const da = arrows[4 * q] - a, db = arrows[4 * q + 1] - b;
          const s = da * da + db * db;
          if (s > d2) continue;
          const dad = arrows[4 * q + 2] - ad, dbd = arrows[4 * q + 3] - bd;
          if (s + dt2 * (dad * dad + dbd * dbd) <= d2) nb.push(q);
        }
      }
    }
    if (nb.length >= minSize) {
      nb.sort((x, y) => x - y);
      const k = nb.join(',');
      if (!into.has(k)) into.set(k, Int32Array.from(nb));
    }
  }
  return into;
}

/** Drop clusters that are proper subsets of others (H18 Section 5.1). */
export function removeSubsets(clusters) {
  const list = [...clusters.values()];
  const byFirst = new Map();                       // member -> clusters containing it
  for (const c of list) for (const v of c) { let l = byFirst.get(v); if (!l) byFirst.set(v, (l = [])); l.push(c); }
  const isSubset = (small, big) => {
    let i = 0;
    for (let j = 0; j < big.length && i < small.length; j++) if (big[j] === small[i]) i++;
    return i === small.length;
  };
  return list.filter((c) => !byFirst.get(c[0]).some((o) => o.length > c.length && isSubset(c, o)));
}

/**
 * Score clusters against the true objects of their tracklets (obj < 0 marks
 * false tracklets), with the H18 dispositions pure / valid / erroneous.
 * Returns counts and, per tracklet, its best disposition: 3 pure, 2 valid
 * (its object has 3+ tracklets in the cluster), 1 in an erroneous or
 * interloped cluster only, 0 in no cluster.
 */
export function score(clusters, obj, minSize = 3) {
  const pure = new Set(), valid = new Set();
  let erroneous = 0;
  const status = new Uint8Array(obj.length);
  for (const c of clusters) {
    const counts = new Map();
    for (const v of c) counts.set(obj[v], (counts.get(obj[v]) || 0) + 1);
    const realOnly = [...counts.keys()].every((o) => o >= 0);
    if (counts.size === 1 && realOnly) {
      pure.add(obj[c[0]]); valid.add(obj[c[0]]);
      for (const v of c) status[v] = 3;
      continue;
    }
    let ok = false;
    for (const [o, n] of counts) if (o >= 0 && n >= minSize) { valid.add(o); ok = true; }
    if (!ok) erroneous++;
    for (const v of c) {
      const s = obj[v] >= 0 && counts.get(obj[v]) >= minSize ? 2 : 1;
      if (status[v] < s) status[v] = s;
    }
  }
  return { pureObjects: pure.size, validObjects: valid.size, erroneous, clusters: clusters.length, status };
}

/** Objects with tracklets on at least minSize different nights. */
export function findable(obj, night, minSize = 3) {
  const nights = new Map();
  for (let j = 0; j < obj.length; j++) {
    if (obj[j] < 0) continue;
    let s = nights.get(obj[j]);
    if (!s) nights.set(obj[j], (s = new Set()));
    s.add(night[j]);
  }
  let n = 0;
  for (const s of nights.values()) if (s.size >= minSize) n++;
  return n;
}

// --- False tracklets (not part of H18) ---------------------------------------------

/** A small seeded random number generator (mulberry32), with Gaussian deviates. */
export function rng(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  return { uniform, normal };
}

/**
 * Append nFalse false tracklets (object -1), as in the notebook: each placed
 * uniformly at random in the field (gnomonic square of half-width `half` about
 * ecliptic longitude lam0, latitude 0) on a random night, moving in a straight
 * line at the sky rate of a randomly chosen real tracklet, with 3 detections
 * 20 minutes apart and 0.1" noise. Uses this module's own random numbers, so the
 * false tracklets are statistically like the notebook's but not identical.
 */
export function addFalseTracklets(det, nFalse, { lam0, half, nightsJD, seed = 2, sigmaArcsec = 0.1 }) {
  const R = rng(seed);
  const c = [Math.cos(lam0), Math.sin(lam0), 0];
  const ex = [-Math.sin(lam0), Math.cos(lam0), 0];
  const ey = cross(c, ex);
  const n0 = det.jd.length, m0 = det.tracklet[n0 - 1] + 1;
  // sky-plane rates of the real tracklets, from their first and last detections
  const rates = [];
  for (let i = 0; i < n0; ) {
    let j = i;
    while (j + 1 < n0 && det.tracklet[j + 1] === det.tracklet[i]) j++;
    const u1 = eclipticUnit(det.ra[i], det.dec[i]), u2 = eclipticUnit(det.ra[j], det.dec[j]);
    const span = det.jd[j] - det.jd[i];
    rates.push([(dot(u2, ex) / dot(u2, c) - dot(u1, ex) / dot(u1, c)) / span,
      (dot(u2, ey) / dot(u2, c) - dot(u1, ey) / dot(u1, c)) / span]);
    i = j + 1;
  }
  const n = n0 + 3 * nFalse;
  const out = { jd: new Float64Array(n), ra: new Float64Array(n), dec: new Float64Array(n), tracklet: new Int32Array(n) };
  out.jd.set(det.jd); out.ra.set(det.ra); out.dec.set(det.dec); out.tracklet.set(det.tracklet);
  const sig = sigmaArcsec * ARCSEC;
  for (let f = 0; f < nFalse; f++) {
    const rate = rates[Math.floor(R.uniform() * rates.length)];
    const x0 = (2 * R.uniform() - 1) * half, y0 = (2 * R.uniform() - 1) * half;
    const t0 = nightsJD[Math.floor(R.uniform() * nightsJD.length)];
    for (let k = 0; k < 3; k++) {
      const dtk = (k * 20) / 1440;
      const X = x0 + rate[0] * dtk + sig * R.normal(), Y = y0 + rate[1] * dtk + sig * R.normal();
      const v = [c[0] + X * ex[0] + Y * ey[0], c[1] + X * ex[1] + Y * ey[1], c[2] + X * ex[2] + Y * ey[2]];
      const nv = norm(v);
      const [xe, ye, ze] = v.map((q) => q / nv);
      // ecliptic -> equatorial
      const xq = xe, yq = COS_EPS * ye - SIN_EPS * ze, zq = SIN_EPS * ye + COS_EPS * ze;
      const i = n0 + 3 * f + k;
      out.jd[i] = t0 + dtk;
      out.ra[i] = (Math.atan2(yq, xq) + 2 * Math.PI) % (2 * Math.PI);
      out.dec[i] = Math.asin(Math.max(-1, Math.min(1, zq)));
      out.tracklet[i] = m0 + f;
    }
  }
  return out;
}

/** The whole H18 search: arrows for every (gamma, gamma_dot), clusters merged,
 *  proper subsets removed. onProgress(fraction) is called after each hypothesis. */
export function link(det, tRef, { gammas, gammaDots, d, dt, minSize = 3, zDir = null, onProgress }) {
  const clusters = new Map();
  const total = gammas.length * gammaDots.length;
  let done = 0;
  for (const g of gammas) {
    const p = prepare(det, tRef, g, zDir);
    for (const gd of gammaDots) {
      findClusters(fitArrows(p, gd), d, dt, minSize, clusters);
      if (onProgress) onProgress(++done / total);
    }
  }
  return removeSubsets(clusters);
}

// --- The exported survey ------------------------------------------------------------

/** Decode public/data/heliolinc/field.bin (layout in tools/export_heliolinc_data.py)
 *  into detections and per-tracklet arrays. `meta` is src/data/heliolinc.json. */
export function decodeField(buffer, meta) {
  const nd = meta.nDetections, nt = meta.nTracklets;
  const f32 = (k) => new Float32Array(buffer, 4 * k * nd, nd);
  const t = f32(0), dra = f32(1), ddec = f32(2);
  const obj = new Int32Array(buffer, 12 * nd, nt);
  const cls = new Uint8Array(buffer, 12 * nd + 4 * nt, nt);
  const det = { jd: new Float64Array(nd), ra: new Float64Array(nd), dec: new Float64Array(nd), tracklet: new Int32Array(nd) };
  for (let i = 0; i < nd; i++) {
    det.jd[i] = meta.windowCentreJD + t[i];
    det.ra[i] = meta.raRef + dra[i];
    det.dec[i] = meta.decRef + ddec[i];
    det.tracklet[i] = Math.floor(i / 3);
  }
  const night = new Int32Array(nt);
  for (let j = 0; j < nt; j++) night[j] = Math.floor((det.jd[3 * j] + det.jd[3 * j + 2]) / 2 - 0.5);
  return { det, obj: Int32Array.from(obj), cls: Uint8Array.from(cls), night };
}
