// Planet Nine and the secular dynamics of distant TNOs, after Li, Hadden, Payne &
// Holman (2018, AJ 156, 263). A port of the science-notebooks module
// notebooks/planet_nine/p9sec.py: the TNO's eccentricity and angular-momentum
// vectors evolve under Planet Nine's force averaged over both orbits (Gauss's
// method, sampled uniformly in eccentric anomaly, refined where the orbits nearly
// cross) and, optionally, the giant planets' J2 potential. Units: au, years, solar
// masses. Validated against the notebook by tools/validate_planet9/.

export const G = 4 * Math.PI ** 2;
export const M_EARTH = 3.003489e-6;
const GIANTS = [[9.547919e-4, 5.2026], [2.858860e-4, 9.5549], [4.366244e-5, 19.2184], [5.151389e-5, 30.1104]];
export const SUM_MA2 = GIANTS.reduce((s, [m, a]) => s + m * a * a, 0);
const J2R2 = 0.5 * SUM_MA2;
export const DEG = Math.PI / 180;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/** Points on an orbit, uniform in eccentric anomaly, with time weights (1 - e cos E)/n. */
function orbitPoints(a, ev, jv, n) {
  const e = norm(ev), jn = norm(jv), W = jv.map((c) => c / jn);
  let P;
  if (e > 1e-12) P = ev.map((c) => c / e);
  else { P = cross([0, 0, 1], W); const pn = norm(P); P = pn > 1e-12 ? P.map((c) => c / pn) : [1, 0, 0]; }
  const Q = cross(W, P), b = Math.sqrt(1 - e * e), nm = Math.sqrt(G / a ** 3);
  const r = new Float64Array(3 * n), v = new Float64Array(3 * n), w = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const E = (k + 0.5) * 2 * Math.PI / n, c = Math.cos(E), s = Math.sin(E);
    const x = a * (c - e), y = a * b * s, ed = nm / (1 - e * c), vx = -a * s * ed, vy = a * b * c * ed;
    for (let i = 0; i < 3; i++) { r[3 * k + i] = x * P[i] + y * Q[i]; v[3 * k + i] = vx * P[i] + vy * Q[i]; }
    w[k] = (1 - e * c) / n;
  }
  return { r, v, w, n };
}

export function p9Vectors(e9, i9, w9, O9) {
  const cO = Math.cos(O9), sO = Math.sin(O9), cw = Math.cos(w9), sw = Math.sin(w9), ci = Math.cos(i9), si = Math.sin(i9);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si], W = [sO * si, -cO * si, ci];
  return { ev: P.map((c) => e9 * c), jv: W.map((c) => Math.sqrt(1 - e9 * e9) * c) };
}

/** LHPH18 Eq. 3: Planet Nine's precession rates (rad/yr) from the giant planets. */
export function p9Precession(a9, e9) {
  const base = Math.sqrt(G) / (a9 ** 1.5 * (1 - e9 * e9) ** 2) * SUM_MA2 / a9 ** 2;
  return [1.5 * base, -0.75 * base];
}

export class Secular {
  constructor(a, { m9 = 10 * M_EARTH, a9 = 500, e9 = 0.6, i9 = 0, w9 = 0, O9 = 0, j2 = true, n = 96, nFine = 256, dFine = 15, soft = 2 } = {}) {
    Object.assign(this, { a, m9, a9, e9, i9, w9, O9, j2, n, nFine, dFine, soft2: soft * soft });
    [this.dw9, this.dO9] = j2 ? p9Precession(a9, e9) : [0, 0];
    this.L = Math.sqrt(G * a);
  }
  force(t, ev, jv, n1, n2) {
    const T = orbitPoints(this.a, ev, jv, n1);
    const p = p9Vectors(this.e9, this.i9, this.w9 + this.dw9 * t, this.O9 + this.dO9 * t);
    const N = orbitPoints(this.a9, p.ev, p.jv, n2);
    const F = new Float64Array(3 * n1);
    let ix = 0, iy = 0, iz = 0, dmin2 = Infinity;
    for (let m = 0; m < n2; m++) {
      const x = N.r[3 * m], y = N.r[3 * m + 1], z = N.r[3 * m + 2], r3 = (x * x + y * y + z * z) ** 1.5;
      ix += N.w[m] * x / r3; iy += N.w[m] * y / r3; iz += N.w[m] * z / r3;
    }
    for (let k = 0; k < n1; k++) {
      const rx = T.r[3 * k], ry = T.r[3 * k + 1], rz = T.r[3 * k + 2];
      let fx = 0, fy = 0, fz = 0;
      for (let m = 0; m < n2; m++) {
        const dx = N.r[3 * m] - rx, dy = N.r[3 * m + 1] - ry, dz = N.r[3 * m + 2] - rz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < dmin2) dmin2 = d2;
        const f = N.w[m] / (d2 + this.soft2) ** 1.5;
        fx += f * dx; fy += f * dy; fz += f * dz;
      }
      const gm = G * this.m9;
      F[3 * k] = gm * (fx - ix); F[3 * k + 1] = gm * (fy - iy); F[3 * k + 2] = gm * (fz - iz);
    }
    return { F, T, dmin: Math.sqrt(dmin2) };
  }
  rhs(t, y) {
    const ev = [y[0], y[1], y[2]], jv = [y[3], y[4], y[5]];
    let res = this.force(t, ev, jv, this.n, this.n);
    if (res.dmin < this.dFine) res = this.force(t, ev, jv, this.nFine, this.nFine);
    const { F, T } = res;
    const k2 = G * J2R2;
    const hd = [0, 0, 0], ed = [0, 0, 0];
    for (let k = 0; k < T.n; k++) {
      const r = [T.r[3 * k], T.r[3 * k + 1], T.r[3 * k + 2]], v = [T.v[3 * k], T.v[3 * k + 1], T.v[3 * k + 2]];
      const f = [F[3 * k], F[3 * k + 1], F[3 * k + 2]];
      if (this.j2) {
        const rn = norm(r), z = r[2], c = (7.5 * z * z / (rn * rn) - 1.5) / rn ** 5;
        f[0] += k2 * r[0] * c; f[1] += k2 * r[1] * c; f[2] += k2 * (r[2] * c - 3 * z / rn ** 5);
      }
      const h = cross(r, v), rf = cross(r, f), fh = cross(f, h), vrf = cross(v, rf), w = T.w[k];
      for (let i = 0; i < 3; i++) { hd[i] += w * rf[i]; ed[i] += w * (fh[i] + vrf[i]) / G; }
    }
    return [ed[0], ed[1], ed[2], hd[0] / this.L, hd[1] / this.L, hd[2] / this.L];
  }
}

export function toVectors(e, i, w, O) {
  const p = p9Vectors(e, i, w, O);
  return [...p.ev, ...p.jv];
}

/** (e, i, omega, Omega, varpi, theta_e) from (e vector, j vector); angles in radians. */
export function toElements(y) {
  const ev = [y[0], y[1], y[2]], jv = [y[3], y[4], y[5]];
  const e = norm(ev), jn = norm(jv);
  const inc = Math.acos(Math.max(-1, Math.min(1, jv[2] / jn)));
  const O = Math.atan2(jv[0], -jv[1]);
  const nv = [Math.cos(O), Math.sin(O), 0], c = cross(nv, ev);
  const w = Math.atan2((c[0] * jv[0] + c[1] * jv[1] + c[2] * jv[2]) / jn, nv[0] * ev[0] + nv[1] * ev[1]);
  const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { e, i: inc, w: wrap(w), O: wrap(O), varpi: wrap(w + O), thetaE: wrap(Math.atan2(ev[1], ev[0])) };
}

// Dormand-Prince 5(4) with adaptive steps
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/**
 * Integrate the secular equations from 0 to tEnd (years); calls onOut(t, y) at nOut evenly
 * spaced times (by dense linear interpolation between steps), and onProgress(f).
 * Stops early, as the notebook does, if the pericentre a (1 - e) falls below RP_STOP: the giant
 * planets would scatter such a TNO, and as e -> 1 the equations become stiff.
 * Returns { y, tStop } (tStop = tEnd if it ran to the end).
 */
export const RP_STOP = 10;
export function evolve(sec, y0, tEnd, nOut, { rtol = 1e-7, atol = 1e-9, onOut, onProgress } = {}) {
  let t = 0, y = y0.slice(), h = tEnd / 2000;
  let k1 = sec.rhs(t, y);
  const outT = Array.from({ length: nOut }, (_, k) => k * tEnd / (nOut - 1));
  let oi = 0;
  if (onOut) { onOut(0, y); oi = 1; }
  while (t < tEnd) {
    if (t + h > tEnd) h = tEnd - t;
    const K = [k1];
    for (let s = 1; s < 7; s++) {
      const ys = y.map((yi, c) => yi + h * A[s].reduce((acc, a, j) => acc + a * K[j][c], 0));
      K.push(s === 6 ? null : sec.rhs(t + C[s] * h, ys));
      if (s === 6) { K[6] = sec.rhs(t + h, ys); K.y5 = ys; }
    }
    const y5 = K.y5;
    let err = 0;
    for (let c = 0; c < 6; c++) {
      const y4 = y[c] + h * B4.reduce((acc, b, j) => acc + b * K[j][c], 0);
      const sc = atol + rtol * Math.max(Math.abs(y[c]), Math.abs(y5[c]));
      err = Math.max(err, Math.abs(y5[c] - y4) / sc);
    }
    if (!Number.isFinite(err)) err = 10;          // e.g. a trial step past e = 1: reject it
    if (err <= 1) {
      const tn = t + h;
      while (onOut && oi < nOut && outT[oi] <= tn + 1e-9) {
        const f = (outT[oi] - t) / h;
        onOut(outT[oi], y.map((yi, c) => yi + f * (y5[c] - yi)));
        oi += 1;
      }
      t = tn; y = y5; k1 = K[6];
      if (onProgress) onProgress(t / tEnd);
      if (sec.a * (1 - Math.hypot(y[0], y[1], y[2])) < RP_STOP) return { y, tStop: t };
    }
    h *= Math.min(5, Math.max(0.2, 0.9 * (err > 0 ? err : 1e-10) ** -0.2));
  }
  return { y, tStop: tEnd };
}
