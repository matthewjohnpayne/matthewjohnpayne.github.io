// Interstellar objects and the LSST, after Hoover, Seligman & Payne (2022, PSJ 3, 71).
// A port of the science-notebooks module notebooks/iso_lsst/iso.py: the Galactic
// velocity distribution of interstellar objects, their exact two-body (hyperbolic)
// paths through the Solar System, their brightness seen from Earth, and whether
// Rubin Observatory could see them on a given night. Units: au, days and km/s.
// Validated against the notebook by tools/validate_iso/.

export const DEG = Math.PI / 180;
export const AU_KM = 1.495978707e8;
export const DAY_S = 86400;
export const KMS_TO_AUD = DAY_S / AU_KM;
export const GM_SUN = 1.32712440018e11 * DAY_S ** 2 / AU_KM ** 3;
export const V_ESC_1AU = Math.sqrt(2 * GM_SUN) / KMS_TO_AUD;
const OBL = 23.4392911 * DEG;
const JD2000 = 2451545.0;
const RUBIN_LAT = -30.2446 * DEG;
export const R_START = 5, B_MAX = 5, T_SPAN = 3 * 365.25, H_OUMUAMUA = 22.4;
export const M_BRIGHT = 16, M_FAINT = 24;
const DEC_MAX = 12 * DEG, ALT_MIN = 30 * DEG, SUN_ALT_MAX = -18 * DEG;

// ICRS -> Galactic rotation (Hipparcos catalogue, ESA 1997).
const A_G = [[-0.0548755604, -0.8734370902, -0.4838350155],
             [+0.4941094279, -0.4448296300, +0.7469822445],
             [-0.8676661490, -0.1980763734, +0.4559837762]];
const ce = Math.cos(OBL), se = Math.sin(OBL);
const EQ_TO_ECL = [[1, 0, 0], [0, ce, se], [0, -se, ce]];
const mul = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
const mulT = (M, v) => [0, 1, 2].map((i) => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2]);
export const galToEq = (v) => mulT(A_G, v);
export const eqToGal = (v) => mul(A_G, v);
export const eqToEcl = (v) => mul(EQ_TO_ECL, v);
export const eclToEq = (v) => mulT(EQ_TO_ECL, v);
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// HSP22 Table 1 (after Binney & Merrifield 1998): dispersions in km/s, vertex deviation in degrees.
export const POPULATIONS = {
  M: { sigma: [31, 23, 16], vertex: 7 },
  G: { sigma: [26, 18, 15], vertex: 12 },
  'O/B': { sigma: [12, 11, 9], vertex: 36 }
};
// The Sun's motion relative to the Local Standard of Rest, (U, V, W) in km/s.
export const SOLAR_MOTION = {
  'Schönrich et al. (2010)': [11.1, 12.24, 7.25],
  'Dehnen & Binney (1998)': [10.0, 5.25, 7.17]
};
export const DEFAULT_SOLAR = 'Schönrich et al. (2010)';

/** HSP22's gravitational-focusing weight, xi = 1 + (42 km/s / (v_inf + 2 km/s))^2. */
export const focusing = (v) => 1 + (V_ESC_1AU / (v + 2)) ** 2;

/** Relative probability of arriving with heliocentric Galactic velocity v (km/s). */
export function density(v, pop = 'G', solar = DEFAULT_SOLAR, focus = true) {
  const p = POPULATIONS[pop], s = SOLAR_MOTION[solar], lv = p.vertex * DEG;
  const U = v[0] + s[0], V = v[1] + s[1], W = v[2] + s[2];
  const u = Math.cos(lv) * U + Math.sin(lv) * V, w = -Math.sin(lv) * U + Math.cos(lv) * V;
  let f = Math.exp(-0.5 * ((u / p.sigma[0]) ** 2 + (w / p.sigma[1]) ** 2 + (W / p.sigma[2]) ** 2));
  if (focus) f *= focusing(norm(v));
  return f;
}

export function radec(u) {
  const ra = ((Math.atan2(u[1], u[0]) / DEG) % 360 + 360) % 360;
  return [ra, Math.asin(Math.max(-1, Math.min(1, u[2] / norm(u)))) / DEG];
}

export function solarApex(solar = DEFAULT_SOLAR) { return radec(galToEq(SOLAR_MOTION[solar])); }

/** Probability of arriving FROM each direction, on an nDec x nRa grid of cell centres
 * (row 0 at Dec = -90 deg, column 0 at RA = 0), normalised to a maximum of 1. */
export function radiantMap(pop, solar, focus, nRa = 144, nDec = 72, nV = 120, vmax = 100) {
  const map = new Float64Array(nRa * nDec);
  let mx = 0;
  for (let j = 0; j < nDec; j++) {
    const dec = (-90 + (j + 0.5) * 180 / nDec) * DEG;
    for (let i = 0; i < nRa; i++) {
      const ra = (i + 0.5) * 360 / nRa * DEG;
      const g = eqToGal([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]);
      let sum = 0;
      for (let k = 1; k <= nV; k++) {
        const s = k * vmax / nV;
        sum += density([-s * g[0], -s * g[1], -s * g[2]], pop, solar, focus) * s * s;
      }
      map[j * nRa + i] = sum;
      if (sum > mx) mx = sum;
    }
  }
  for (let k = 0; k < map.length; k++) map[k] /= mx;
  return { map, nRa, nDec };
}

// ------------------------------------------------------------ random numbers
/** A small seeded generator (mulberry32), so that a drawn visitor can be shared by its seed. */
export function rng(seed) {
  let a = seed >>> 0;
  const uni = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = uni();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uni());
  };
  return { uni, normal };
}

/** Draw one heliocentric Galactic velocity (km/s) from the weighted distribution, by rejection. */
export function sampleVelocity(r, pop = 'G', solar = DEFAULT_SOLAR, focus = true, vmax = 100) {
  const p = POPULATIONS[pop], s = SOLAR_MOTION[solar], lv = p.vertex * DEG;
  const fmax = focus ? focusing(0) : 1;
  for (;;) {
    const w1 = r.normal() * p.sigma[0], w2 = r.normal() * p.sigma[1], w3 = r.normal() * p.sigma[2];
    const v = [Math.cos(lv) * w1 - Math.sin(lv) * w2 - s[0], Math.sin(lv) * w1 + Math.cos(lv) * w2 - s[1], w3 - s[2]];
    if (Math.abs(v[0]) > vmax || Math.abs(v[1]) > vmax || Math.abs(v[2]) > vmax) continue;
    if (!focus || r.uni() * fmax < focusing(norm(v))) return v;
  }
}

/** Draw a visitor as HSP22 do: velocity, offset b (p(b) ~ b^2 on 0-5 au), azimuth psi, start date in 2021. */
export function drawVisitor(seed, pop = 'G', solar = DEFAULT_SOLAR, focus = true) {
  const r = rng(seed);
  const vGal = sampleVelocity(r, pop, solar, focus);
  return { vGal, b: B_MAX * Math.cbrt(r.uni()), psi: 2 * Math.PI * r.uni(), day: Math.floor(365 * r.uni()) };
}

// ------------------------------------------------------------ orbits
/** Starting state on the 5 au sphere (ecliptic frame; au and au/day), as in iso.place. */
export function place(vGal, b, psi) {
  const vEcl = eqToEcl(galToEq(vGal));
  const vInf = norm(vEcl), vh = vEcl.map((c) => c / vInf);
  const ref = Math.abs(vh[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = cross(vh, ref);
  const n1 = norm(e1); e1 = e1.map((c) => c / n1);
  const e2 = cross(vh, e1);
  const along = -Math.sqrt(R_START ** 2 - b ** 2);
  const r0 = [0, 1, 2].map((k) => along * vh[k] + b * (Math.cos(psi) * e1[k] + Math.sin(psi) * e2[k]));
  const speed = Math.sqrt(vInf ** 2 + (V_ESC_1AU / Math.sqrt(R_START)) ** 2) * KMS_TO_AUD;
  return { r0, v0: vh.map((c) => c * speed), vInf };
}

/** Conic elements of a heliocentric hyperbolic state; time of perihelion relative to t = 0. */
export function elements(r0, v0) {
  const r = norm(r0), v2 = dot3(v0, v0), h = cross(r0, v0), hn = norm(h);
  const vxh = cross(v0, h);
  const ev = [0, 1, 2].map((k) => vxh[k] / GM_SUN - r0[k] / r);
  const e = norm(ev), a = 1 / (2 / r - v2 / GM_SUN);
  const P = ev.map((c) => c / e), Q = cross(h.map((c) => c / hn), P);
  const coshF = Math.max((1 + r / -a) / e, 1);
  const F = Math.acosh(coshF) * Math.sign(dot3(r0, v0));
  const n = Math.sqrt(GM_SUN / (-a) ** 3);
  return { a, e, q: a * (1 - e), inc: Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) / DEG, P, Q, n, tPeri: -(e * Math.sinh(F) - F) / n };
}

/** Solve e sinh F - F = M by Newton's method, kept inside a bracket (bisection fallback). */
export function solveHyperbolic(M, e) {
  const s = Math.sign(M), Ma = Math.abs(M);
  let lo = Math.asinh(Ma / e), hi = Math.asinh(Ma / (e - 1));
  let F = Ma > 6 * e ? Math.min(Math.log(2 * Ma / e + 1.8), hi) : lo;
  for (let it = 0; it < 100; it++) {
    const g = e * Math.sinh(F) - F - Ma;
    if (g < 0) lo = F; else if (g > 0) hi = F;
    let Fn = F - g / (e * Math.cosh(F) - 1);
    if (!(Fn > lo && Fn < hi)) Fn = 0.5 * (lo + hi);
    const done = Math.abs(Fn - F) <= 1e-13 * (1 + Fn);
    F = Fn;
    if (done) break;
  }
  return s * F;
}

export function position(el, t) {
  const F = solveHyperbolic(el.n * (t - el.tPeri), el.e);
  const A = -el.a, x = A * (el.e - Math.cosh(F)), y = A * Math.sqrt(el.e ** 2 - 1) * Math.sinh(F);
  return [0, 1, 2].map((k) => x * el.P[k] + y * el.Q[k]);
}

/** Heliocentric ecliptic J2000 position of the Earth (Astronomical Almanac low-precision Sun). */
export function earthPosition(jd) {
  const n = jd - JD2000;
  const L = (280.460 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + 1.915 * DEG * Math.sin(g) + 0.020 * DEG * Math.sin(2 * g) - 1.3970 * DEG * n / 36525;
  const R = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return [-R * Math.cos(lam), -R * Math.sin(lam), 0];
}

// ------------------------------------------------------------ brightness and visibility
export const phaseIntegral = (th) => (2 / 3) * ((1 - th / Math.PI) * Math.cos(th) + Math.sin(th) / Math.PI);

/** HSP22's apparent magnitude, m = H + 2.5 log10(d_BS^2 d_BO^2 / (p(theta) d_OS^4)). */
export function magnitude(H, dbs, dbo, dos) {
  const c = (dbo ** 2 + dbs ** 2 - dos ** 2) / (2 * dbo * dbs);
  const th = Math.acos(Math.max(-1, Math.min(1, c)));
  return H + 2.5 * Math.log10(dbs ** 2 * dbo ** 2 / (phaseIntegral(th) * dos ** 4));
}

function halfArc(alt, dec) {
  const c = (Math.sin(alt) - Math.sin(RUBIN_LAT) * Math.sin(dec)) / (Math.cos(RUBIN_LAT) * Math.cos(dec));
  return c >= 1 ? 0 : Math.acos(Math.max(-1, c));
}

/** Above 30 deg at Rubin, at some moment while the Sun is below -18 deg, and south of +12 deg. */
export function observableTonight(ra, dec, raSun, decSun) {
  const up = halfArc(ALT_MIN, dec), dark = Math.PI - halfArc(SUN_ALT_MAX, decSun);
  let sep = (ra - raSun - Math.PI + Math.PI) % (2 * Math.PI);
  if (sep < 0) sep += 2 * Math.PI;
  sep = Math.abs(sep - Math.PI);
  return up > 0 && sep < up + dark && dec < DEC_MAX;
}

const raDecOf = (x) => { const e = eclToEq(x); return [Math.atan2(e[1], e[0]), Math.asin(e[2] / norm(e))]; };

/**
 * Follow one object night by night for 3 years from Julian date jd0. Returns the nightly
 * track (Float64Arrays) and its orbit; brightness is for H = 22.4 (shift by H - 22.4).
 */
export function track(r0, v0, jd0) {
  const el = elements(r0, v0);
  const N = Math.floor(T_SPAN) + 1;
  const out = { el, N, x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
    ex: new Float64Array(N), ey: new Float64Array(N), m: new Float64Array(N), dEarth: new Float64Array(N),
    dSun: new Float64Array(N), obs: new Uint8Array(N), ra: new Float64Array(N), dec: new Float64Array(N) };
  for (let d = 0; d < N; d++) {
    const r = position(el, d), E = earthPosition(jd0 + d);
    const geo = [r[0] - E[0], r[1] - E[1], r[2] - E[2]];
    const dbs = norm(r), dbo = norm(geo), dos = norm(E);
    out.x[d] = r[0]; out.y[d] = r[1]; out.z[d] = r[2]; out.ex[d] = E[0]; out.ey[d] = E[1];
    out.dSun[d] = dbs; out.dEarth[d] = dbo;
    out.m[d] = magnitude(H_OUMUAMUA, dbs, dbo, dos);
    const [ra, dec] = raDecOf(geo), [ras, decs] = raDecOf([-E[0], -E[1], -E[2]]);
    out.ra[d] = ra; out.dec[d] = dec;
    out.obs[d] = observableTonight(ra, dec, ras, decs) ? 1 : 0;
  }
  // Closest approach to the Earth: the nightly minimum, refined by a parabola (as in the notebook)
  let j = 0;
  for (let d = 1; d < N; d++) if (out.dEarth[d] < out.dEarth[j]) j = d;
  j = Math.min(Math.max(j, 1), N - 2);
  const y0 = out.dEarth[j - 1], y1 = out.dEarth[j], y2 = out.dEarth[j + 1], den = y0 - 2 * y1 + y2;
  const off = den > 0 ? Math.max(-1, Math.min(1, 0.5 * (y0 - y2) / den)) : 0;
  out.tClosest = j + off;
  out.dMin = y1 - 0.25 * (y0 - y2) * off;
  return out;
}

/** First observable night with M_BRIGHT < m <= lim for absolute magnitude H, or -1. */
export function firstDetection(tr, H = H_OUMUAMUA, lim = M_FAINT) {
  const dm = H - H_OUMUAMUA;
  for (let d = 0; d < tr.N; d++) if (tr.obs[d] && tr.m[d] + dm <= lim && tr.m[d] + dm > M_BRIGHT) return d;
  return -1;
}

/** HSP22's Delta-v scale: closest distance to Earth / time from detection to closest approach (km/s). */
export function deltaV(tr, day) {
  const wait = tr.tClosest - day;
  return day < 0 || wait <= 0 ? Infinity : tr.dMin / wait * AU_KM / DAY_S;
}

// ------------------------------------------------------------ the known visitors
// JPL Small-Body Database elements (ecliptic J2000), retrieved 2026-10-15, as in the notebook.
export const KNOWN = {
  '1I/ʻOumuamua': { q: 0.2559115812959116, e: 1.201133796102373, i: 122.7417062847286, Om: 24.59690955523242, w: 241.8105360304898 },
  '2I/Borisov': { q: 2.006520878500843, e: 3.356475782676596, i: 44.05264247909138, Om: 308.1477292269942, w: 209.1236864378081 },
  '3I/ATLAS': { q: 1.356481057231181, e: 6.141351449317625, i: 175.1164570850441, Om: 322.1696089290778, w: 128.0228697185194 }
};

/** Speed at infinity (km/s) and radiant [RA, Dec] (deg) of a hyperbolic orbit. */
export function asymptote({ q, e, i, Om, w }) {
  [i, Om, w] = [i * DEG, Om * DEG, w * DEG];
  const P = [Math.cos(Om) * Math.cos(w) - Math.sin(Om) * Math.sin(w) * Math.cos(i),
    Math.sin(Om) * Math.cos(w) + Math.cos(Om) * Math.sin(w) * Math.cos(i), Math.sin(w) * Math.sin(i)];
  const Q = [-Math.cos(Om) * Math.sin(w) - Math.sin(Om) * Math.cos(w) * Math.cos(i),
    -Math.sin(Om) * Math.sin(w) + Math.cos(Om) * Math.cos(w) * Math.cos(i), Math.cos(w) * Math.sin(i)];
  const nu = Math.acos(-1 / e);
  const u = [0, 1, 2].map((k) => Math.cos(nu) * P[k] - Math.sin(nu) * Q[k]);
  return { vInf: Math.sqrt(GM_SUN * (e - 1) / q) / KMS_TO_AUD, radiant: radec(eclToEq(u)) };
}

/** Objects entering the 5 au sphere per year for number density n0 (au^-3) and typical speed v (km/s). */
export function rateFactor(v, n0 = 0.1) {
  return n0 * 4 / 3 * Math.PI * R_START ** 3 / ((4 / 3 * R_START) / (v * KMS_TO_AUD * 365.25));
}

/** Ecliptic and Galactic planes as [RA, Dec] lists (deg). */
export function greatCircle(which) {
  const pts = [];
  for (let k = 0; k <= 360; k += 2) {
    const l = k * DEG, u = [Math.cos(l), Math.sin(l), 0];
    pts.push(radec(which === 'ecliptic' ? eclToEq(u) : galToEq(u)));
  }
  return pts;
}
