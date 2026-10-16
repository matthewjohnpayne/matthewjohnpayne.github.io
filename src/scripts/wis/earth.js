// Where a ground-based observatory is, after the MPC's wis package
// (https://github.com/Smithsonian/mpc-public/tree/main/wis): its geocentric position in the
// equatorial J2000 frame, from its MPC parallax constants (longitude, rho cos phi', rho sin phi').
// wis rotates the Earth-fixed position with NASA/JPL SPICE (ITRF93 -> J2000, with measured Earth
// orientation); here the rotation is built from Earth rotation angle, IAU 1976 precession and the
// 13 largest terms of IAU 1980 nutation, leaving out polar motion and UT1 - UTC (< 0.9 s).
// Agreement with wis is measured by tools/validate_wis/.

export const R_EARTH_KM = 6378.1363;     // as wis (pck00011.tpc)
const AS = Math.PI / (180 * 3600), DEG = Math.PI / 180;

// TAI - UTC (s) from the given dates (IERS Bulletin C); no leap second has been added since 2017.
const LEAP = [[1972, 0, 10], [1972, 6, 11], [1973, 0, 12], [1974, 0, 13], [1975, 0, 14], [1976, 0, 15], [1977, 0, 16], [1978, 0, 17], [1979, 0, 18], [1980, 0, 19],
  [1981, 6, 20], [1982, 6, 21], [1983, 6, 22], [1985, 6, 23], [1988, 0, 24], [1990, 0, 25], [1991, 0, 26], [1992, 6, 27], [1993, 6, 28], [1994, 6, 29],
  [1996, 0, 30], [1997, 6, 31], [1999, 0, 32], [2006, 0, 33], [2009, 0, 34], [2012, 6, 35], [2015, 6, 36], [2017, 0, 37]].map(([y, m, s]) => [Date.UTC(y, m, 1), s]);
export function taiMinusUtc(ms) { let s = 10; for (const [t, v] of LEAP) if (ms >= t) s = v; return s; }

/** Julian dates (UTC, approximating UT1) and TT, from a JavaScript time in ms. */
export function julian(ms) {
  const jdUtc = ms / 86400000 + 2440587.5;
  return { jdUt1: jdUtc, jdTt: jdUtc + (taiMinusUtc(ms) + 32.184) / 86400 };
}

const R1 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R2 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const R3 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const T_ = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
const apply = (A, v) => A.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

// IAU 1980 nutation, largest terms: multipliers of (l, l', F, D, Omega), then dpsi = (a + b T) and
// deps = (c + d T), in units of 0.0001 arcsec.
const NUT = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9], [0, 0, 2, -2, 2, -13187, -1.6, 5736, -3.1], [0, 0, 2, 0, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5], [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1], [1, 0, 0, 0, 0, 712, 0.1, -7, 0],
  [0, 1, 2, -2, 2, -517, 1.2, 224, -0.6], [0, 0, 2, 0, 1, -386, -0.4, 200, 0], [1, 0, 2, 0, 2, -301, 0, 129, -0.1],
  [0, -1, 2, -2, 2, 217, -0.5, -95, 0.3], [1, 0, 0, -2, 0, -158, 0, -1, 0], [0, 0, 2, -2, 1, 129, 0.1, -70, 0], [-1, 0, 2, 0, 2, 123, 0, -53, 0]
];

/** Matrix taking Earth-fixed vectors to equatorial J2000 at a JavaScript time (ms, UTC). */
export function earthToJ2000(ms) {
  const { jdUt1, jdTt } = julian(ms);
  const T = (jdTt - 2451545.0) / 36525;
  // precession (Lieske et al. 1977)
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * AS;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * AS;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * AS;
  const P = mul(R3(-z), mul(R2(theta), R3(-zeta)));
  // nutation
  const args = [134.96340251 + 477198.8675605 * T, 357.52910918 + 35999.0502911 * T, 93.27209062 + 483202.0175381 * T,
    297.85019547 + 445267.1114469 * T, 125.04455501 - 1934.1362619 * T].map((d) => d * DEG);
  let dpsi = 0, deps = 0;
  for (const [a, b, c, d, e, s0, s1, c0, c1] of NUT) {
    const arg = a * args[0] + b * args[1] + c * args[2] + d * args[3] + e * args[4];
    dpsi += (s0 + s1 * T) * Math.sin(arg); deps += (c0 + c1 * T) * Math.cos(arg);
  }
  dpsi *= 1e-4 * AS; deps *= 1e-4 * AS;
  const eps0 = (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) * AS;
  const N = mul(R1(-(eps0 + deps)), mul(R3(-dpsi), R1(eps0)));
  // sidereal time: Earth rotation angle, GMST (IAU 2006) and the equation of the equinoxes
  const Du = jdUt1 - 2451545.0;
  const era = 2 * Math.PI * ((0.7790572732640 + 0.00273781191135448 * Du + (Du % 1) + 1) % 1);
  const gmst = era + (0.014506 + 4612.156534 * T + 1.3915817 * T * T - 0.00000044 * T ** 3) * AS;
  const gast = gmst + dpsi * Math.cos(eps0 + deps);
  // r_J2000 = P^T N^T R3(-GAST) r_fixed
  return mul(T_(P), mul(T_(N), R3(-gast)));
}

/** Geocentric equatorial J2000 position (km) of a station with MPC parallax constants. */
export function stationJ2000(ms, lonDeg, rhoCos, rhoSin) {
  const l = lonDeg * DEG;
  const fixed = [rhoCos * Math.cos(l) * R_EARTH_KM, rhoCos * Math.sin(l) * R_EARTH_KM, rhoSin * R_EARTH_KM];
  return apply(earthToJ2000(ms), fixed);
}
