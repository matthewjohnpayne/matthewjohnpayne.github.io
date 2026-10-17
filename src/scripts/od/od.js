// Orbit determination for the page "How do you find an orbit?": everything is
// computed here from real astrometry of 2024 YR4 (public/data/od/yr4.json).
//
//  * Force model: the Sun, eight planets and the Moon, at positions tabulated
//    from JPL Horizons every 0.25 day and interpolated (cubic Hermite);
//    barycentric ICRF frame; fixed-step fourth-order Runge-Kutta.
//  * Observation model: astrometric RA and Dec from the observatory, with
//    light-time correction.
//  * Gauss's method with iterative improvement (universal variables), the
//    admissible region of a single tracklet, and weighted least squares
//    (differential correction) with outlier rejection.
//
// Checked against an independent SciPy implementation and JPL Horizons by
// tools/validate_od/ (reference.py, then compare.mjs). Units: au, days, radians.

export const AS = Math.PI / 180 / 3600;           // one arcsecond in radians
export const KM_PER_AU = 1.495978707e8;
export const KMS_PER_AUD = KM_PER_AU / 86400;      // 1 au/day in km/s
const EPS = 84381.448 * AS;                        // J2000 obliquity, ICRF -> ecliptic
export const SIGMA_FLOOR = 0.5;                    // arcsec: no observation is weighted as better than this
export const CHI2_REJECT = 8, CHI2_RECOVER = 7;    // outlier rule (Carpino et al. 2003)
export const STEP = 1 / 64;                        // RK4 step, days

/** Prepare the data file: planet tables as typed arrays, observations with weights. */
export function load(data) {
  const tb = data.table;
  const bodies = tb.bodies.map((name) => {
    const b = tb.data[name], xv = new Float64Array(tb.n * 6);
    b.xv.forEach((row, i) => xv.set(row, 6 * i));
    return { name, gm: b.gm, xv };
  });
  const obs = data.obs.map((o) => ({
    ...o, ra: o.ra * Math.PI / 180, dec: o.dec * Math.PI / 180,
    wra: Math.max(o.sra, SIGMA_FLOOR), wdec: Math.max(o.sdec, SIGMA_FLOOR)
  }));
  // Tracklets: consecutive observations from one site within 0.3 day
  const tracklets = [];
  obs.forEach((o, k) => {
    const last = tracklets[tracklets.length - 1];
    if (last && obs[last[last.length - 1]].stn === o.stn && o.t - obs[last[last.length - 1]].t < 0.3) last.push(k);
    else tracklets.push([k]);
  });
  return { t0: tb.t0, step: tb.step, n: tb.n, bodies, gm: bodies.map((b) => b.gm), obs, tracklets,
    c: data.c_au_per_day, epoch: data.epoch, predict: data.predict, jpl: data.jpl };
}

/** Barycentric position (and velocity, if v is given) of body b at time t, by cubic Hermite interpolation. */
export function bodyState(m, b, t, p, v) {
  const xv = m.bodies[b].xv, h = m.step;
  let i = Math.floor((t - m.t0) / h);
  i = Math.max(0, Math.min(m.n - 2, i));
  const s = (t - m.t0) / h - i, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const a = 6 * i, c = a + 6;
  for (let k = 0; k < 3; k++) {
    p[k] = h00 * xv[a + k] + h10 * h * xv[a + 3 + k] + h01 * xv[c + k] + h11 * h * xv[c + 3 + k];
  }
  if (v) {
    const d00 = (6 * s2 - 6 * s) / h, d10 = 3 * s2 - 4 * s + 1, d01 = (-6 * s2 + 6 * s) / h, d11 = 3 * s2 - 2 * s;
    for (let k = 0; k < 3; k++) v[k] = d00 * xv[a + k] + d10 * xv[a + 3 + k] + d01 * xv[c + k] + d11 * xv[c + 3 + k];
  }
}

const _p = [0, 0, 0];
function accel(m, t, x, y, z, out) {
  let ax = 0, ay = 0, az = 0;
  for (let b = 0; b < m.bodies.length; b++) {
    bodyState(m, b, t, _p);
    const dx = _p[0] - x, dy = _p[1] - y, dz = _p[2] - z;
    const r2 = dx * dx + dy * dy + dz * dz, f = m.gm[b] / (r2 * Math.sqrt(r2));
    ax += f * dx; ay += f * dy; az += f * dz;
  }
  out[0] = ax; out[1] = ay; out[2] = az;
}

/**
 * Integrate a barycentric state x0 (at t0) over [tMin, tMax] and return a
 * trajectory: { at(t) -> [x, y, z, vx, vy, vz] }, interpolated between steps.
 */
export function propagate(m, x0, t0, tMin, tMax, h = STEP) {
  const legs = [];
  for (const dir of [-1, 1]) {
    const tEnd = dir < 0 ? Math.min(t0, tMin) : Math.max(t0, tMax);
    const nStep = Math.ceil(Math.abs(tEnd - t0) / h - 1e-9) + 1;
    const st = new Float64Array(6 * (nStep + 1));
    st.set(x0, 0);
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], dt = dir * h;
    let [x, y, z, u, v, w] = x0, t = t0;
    for (let i = 1; i <= nStep; i++) {
      accel(m, t, x, y, z, k1);
      const x2 = x + 0.5 * dt * u, y2 = y + 0.5 * dt * v, z2 = z + 0.5 * dt * w;
      const u2 = u + 0.5 * dt * k1[0], v2 = v + 0.5 * dt * k1[1], w2 = w + 0.5 * dt * k1[2];
      accel(m, t + 0.5 * dt, x2, y2, z2, k2);
      const x3 = x + 0.5 * dt * u2, y3 = y + 0.5 * dt * v2, z3 = z + 0.5 * dt * w2;
      const u3 = u + 0.5 * dt * k2[0], v3 = v + 0.5 * dt * k2[1], w3 = w + 0.5 * dt * k2[2];
      accel(m, t + 0.5 * dt, x3, y3, z3, k3);
      const x4 = x + dt * u3, y4 = y + dt * v3, z4 = z + dt * w3;
      const u4 = u + dt * k3[0], v4 = v + dt * k3[1], w4 = w + dt * k3[2];
      accel(m, t + dt, x4, y4, z4, k4);
      x += dt / 6 * (u + 2 * u2 + 2 * u3 + u4);
      y += dt / 6 * (v + 2 * v2 + 2 * v3 + v4);
      z += dt / 6 * (w + 2 * w2 + 2 * w3 + w4);
      u += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      w += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      t += dt;
      st.set([x, y, z, u, v, w], 6 * i);
    }
    legs.push({ dir, st, nStep });
  }
  return {
    at(tq) {
      const leg = tq < t0 ? legs[0] : legs[1];
      let s = Math.abs(tq - t0) / h;
      let i = Math.min(Math.floor(s), leg.nStep - 1);
      s -= i;
      const a = 6 * i, c = a + 6, st = leg.st, hh = leg.dir * h;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      const d00 = (6 * s2 - 6 * s) / hh, d10 = 3 * s2 - 4 * s + 1, d01 = (-6 * s2 + 6 * s) / hh, d11 = 3 * s2 - 2 * s;
      const out = new Array(6);
      for (let k = 0; k < 3; k++) {
        out[k] = h00 * st[a + k] + h10 * hh * st[a + 3 + k] + h01 * st[c + k] + h11 * hh * st[c + 3 + k];
        out[k + 3] = d00 * st[a + k] + d10 * st[a + 3 + k] + d01 * st[c + k] + d11 * st[c + 3 + k];
      }
      return out;
    }
  };
}

export const unit = (ra, dec) => [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
export function radecOf(v) {
  const r = Math.hypot(v[0], v[1], v[2]);
  let ra = Math.atan2(v[1], v[0]);
  if (ra < 0) ra += 2 * Math.PI;
  return [ra, Math.asin(v[2] / r)];
}

/** Astrometric RA, Dec (rad) of a trajectory seen from site (barycentric position) at time t, with light time. */
export function observe(m, traj, t, site) {
  let tau = 0, rel = [0, 0, 0];
  for (let it = 0; it < 3; it++) {
    const p = traj.at(t - tau);
    rel = [p[0] - site[0], p[1] - site[1], p[2] - site[2]];
    tau = Math.hypot(rel[0], rel[1], rel[2]) / m.c;
  }
  return radecOf(rel);
}

/** Residuals (observed minus computed, arcsec, RA scaled by cos Dec) of the observations idx for the state x at the epoch. */
export function residuals(m, x, idx, epoch = m.epoch, traj = null) {
  let lo = Infinity, hi = -Infinity;
  for (const k of idx) { lo = Math.min(lo, m.obs[k].t); hi = Math.max(hi, m.obs[k].t); }
  traj = traj || propagate(m, x, epoch, lo - 0.01, hi + 0.01);
  const dra = new Float64Array(idx.length), ddec = new Float64Array(idx.length);
  idx.forEach((k, j) => {
    const o = m.obs[k], [ra, dec] = observe(m, traj, o.t, o.site);
    let d = o.ra - ra;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    dra[j] = d * Math.cos(o.dec) / AS;
    ddec[j] = (o.dec - dec) / AS;
  });
  return { dra, ddec };
}

// ------------------------------------------------------------------ small linear algebra
function cholSolve(A0, b0) {         // A symmetric positive definite (n x n arrays); returns x, A^-1
  // equilibrate by the diagonal first: short arcs give badly conditioned normal matrices
  const n = b0.length, dg = A0.map((r, i) => Math.sqrt(r[i]));
  if (!dg.every((v) => v > 0)) return null;
  const A = A0.map((r, i) => r.map((v, j) => v / (dg[i] * dg[j]))), b = b0.map((v, i) => v / dg[i]);
  const L = A.map((r) => r.slice());
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) L[j][j] -= L[j][k] * L[j][k];
    if (!(L[j][j] > 0)) return null;
    L[j][j] = Math.sqrt(L[j][j]);
    for (let i = j + 1; i < n; i++) {
      for (let k = 0; k < j; k++) L[i][j] -= L[i][k] * L[j][k];
      L[i][j] /= L[j][j];
    }
    for (let i = 0; i < j; i++) L[i][j] = 0;
  }
  const solve = (rhs) => {
    const y = rhs.slice();
    for (let i = 0; i < n; i++) { for (let k = 0; k < i; k++) y[i] -= L[i][k] * y[k]; y[i] /= L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { for (let k = i + 1; k < n; k++) y[i] -= L[k][i] * y[k]; y[i] /= L[i][i]; }
    return y;
  };
  const inv = Array.from({ length: n }, (_, i) => solve(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))).map((v, j) => v / (dg[i] * dg[j])));
  return { x: solve(b).map((v, i) => v / dg[i]), inv };
}

/** Lower-triangular Cholesky factor of a covariance matrix (for drawing samples). */
export function cholesky(C) {
  const n = C.length, L = C.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = C[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 0)) : s / L[j][j];
    }
  }
  return L;
}

// ------------------------------------------------------------------ least squares
const SCALE = [1e-3, 1e-3, 1e-3, 1e-5, 1e-5, 1e-5];     // parameter scales (au, au/day) for differences

/**
 * Weighted least-squares orbit from the observations idx, starting at state x
 * (barycentric, at the epoch). Gauss-Newton with central-difference partials and
 * iterative outlier rejection: an observation is dropped when its chi-squared
 * (two coordinates) exceeds CHI2_REJECT and restored when it falls below CHI2_RECOVER.
 * Returns { x, cov, use, dra, ddec, rms, chi2, ok }.
 */
export function fit(m, idx, x, epoch = m.epoch) {
  x = x.slice();
  let use = idx.map(() => true), res, cov = null, ok = true;
  const wra = idx.map((k) => m.obs[k].wra), wde = idx.map((k) => m.obs[k].wdec);
  for (let pass = 0; pass < 6; pass++) {
    const jw = idx.map((_, j) => j).filter((j) => use[j]), sel = jw.map((j) => idx[j]);
    const chiSel = (r) => { let c = 0; jw.forEach((j, i) => { c += (r.dra[i] / wra[j]) ** 2 + (r.ddec[i] / wde[j]) ** 2; }); return c; };
    res = residuals(m, x, sel, epoch);
    let chi2 = chiSel(res);
    let lambda = 0;
    for (let it = 0; it < 15; it++) {
      // central-difference design matrix, rows normalised by the weights
      const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), g = new Array(6).fill(0);
      const cols = [];
      for (let p = 0; p < 6; p++) {
        const d = SCALE[p] * 1e-4, xp = x.slice(), xm = x.slice();
        xp[p] += d; xm[p] -= d;
        const rp = residuals(m, xp, sel, epoch), rm = residuals(m, xm, sel, epoch);
        const col = new Float64Array(2 * sel.length);
        for (let i = 0; i < sel.length; i++) {
          col[2 * i] = -(rp.dra[i] - rm.dra[i]) / (2 * d) / wra[jw[i]] * SCALE[p];
          col[2 * i + 1] = -(rp.ddec[i] - rm.ddec[i]) / (2 * d) / wde[jw[i]] * SCALE[p];
        }
        cols.push(col);
      }
      const r = new Float64Array(2 * sel.length);
      for (let i = 0; i < sel.length; i++) { r[2 * i] = res.dra[i] / wra[jw[i]]; r[2 * i + 1] = res.ddec[i] / wde[jw[i]]; }
      for (let p = 0; p < 6; p++) {
        for (let q = 0; q <= p; q++) { let s = 0; for (let i = 0; i < r.length; i++) s += cols[p][i] * cols[q][i]; A[p][q] = A[q][p] = s; }
        let s = 0; for (let i = 0; i < r.length; i++) s += cols[p][i] * r[i]; g[p] = s;
      }
      let accepted = false;
      for (let tries = 0; tries < 8 && !accepted; tries++) {
        const Ad = A.map((row, p) => row.map((v, q) => (p === q ? v * (1 + lambda) : v)));
        const sol = cholSolve(Ad, g);
        if (!sol) { lambda = Math.max(1e-3, lambda * 10); continue; }
        const xn = x.map((v, p) => v + sol.x[p] * SCALE[p]);
        const rn = residuals(m, xn, sel, epoch);
        const c2 = chiSel(rn);
        if (Number.isFinite(c2) && c2 <= chi2 * (1 + 1e-12)) {
          // predicted decrease of chi-squared for this step: converged when it is far below 1,
          // the size of a statistically meaningful change
          const gain = sol.x.reduce((s2, v, p) => s2 + v * g[p], 0);
          x = xn; res = rn;
          const done = gain < 1e-4;
          chi2 = c2; lambda /= 10; accepted = true;
          if (done) it = 99;
        } else lambda = Math.max(1e-3, lambda * 10);
      }
      if (!accepted) break;
      const inv = cholSolve(A, g).inv;
      cov = inv.map((row, p) => row.map((v, q) => v * SCALE[p] * SCALE[q]));
    }
    // outlier rejection over all the observations offered
    const all = residuals(m, x, idx, epoch);
    const next = idx.map((_, j) => {
      const c = (all.dra[j] / wra[j]) ** 2 + (all.ddec[j] / wde[j]) ** 2;
      return use[j] ? c < CHI2_REJECT : c < CHI2_RECOVER;
    });
    res = all;
    if (next.every((v, j) => v === use[j])) break;
    if (next.filter(Boolean).length < 6) { ok = false; break; }
    use = next;
  }
  let s = 0, n = 0;
  idx.forEach((_, j) => { if (use[j]) { s += res.dra[j] ** 2 + res.ddec[j] ** 2; n += 2; } });
  return { x, cov, use, dra: res.dra, ddec: res.ddec, rms: Math.sqrt(s / n), ok: ok && !!cov };
}

// ------------------------------------------------------------------ orbital elements
export function sunState(m, t) {
  const p = [0, 0, 0], v = [0, 0, 0];
  bodyState(m, 0, t, p, v);
  return [...p, ...v];
}

/** Heliocentric ecliptic elements {a, e, i (deg), q, Q} of a heliocentric ICRF state. */
export function elements(xh, mu) {
  const ce = Math.cos(EPS), se = Math.sin(EPS);
  const r = [xh[0], ce * xh[1] + se * xh[2], -se * xh[1] + ce * xh[2]];
  const v = [xh[3], ce * xh[4] + se * xh[5], -se * xh[4] + ce * xh[5]];
  const h = cross(r, v), rn = norm(r), vv = dot(v, v);
  const ev = cross(v, h).map((c, k) => c / mu - r[k] / rn);
  const e = norm(ev), a = 1 / (2 / rn - vv / mu);
  return { a, e, i: Math.acos(h[2] / norm(h)) * 180 / Math.PI, q: a * (1 - e), Q: a * (1 + e) };
}
/** Points around the heliocentric orbit of a heliocentric ICRF state, in ecliptic x, y (au), for drawing. */
export function orbitPath(xh, mu, n = 240) {
  const ce = Math.cos(EPS), se = Math.sin(EPS);
  const r = [xh[0], ce * xh[1] + se * xh[2], -se * xh[1] + ce * xh[2]];
  const v = [xh[3], ce * xh[4] + se * xh[5], -se * xh[4] + ce * xh[5]];
  const h = cross(r, v), rn = norm(r);
  const ev = cross(v, h).map((c, k) => c / mu - r[k] / rn);
  const e = norm(ev), p = dot(h, h) / mu;
  const P = e > 1e-9 ? ev.map((c) => c / e) : r.map((c) => c / rn);
  const hn = h.map((c) => c / norm(h)), Q = cross(hn, P);
  const out = [];
  const numax = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.98;
  for (let k = 0; k <= n; k++) {
    const nu = -numax + (2 * numax * k) / n, rr = p / (1 + e * Math.cos(nu));
    if (rr > 60) continue;
    out.push([rr * (Math.cos(nu) * P[0] + Math.sin(nu) * Q[0]), rr * (Math.cos(nu) * P[1] + Math.sin(nu) * Q[1])]);
  }
  return out;
}
export const eclipticXY = (x) => [x[0], Math.cos(EPS) * x[1] + Math.sin(EPS) * x[2]];

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// ------------------------------------------------------------------ Gauss's method
function stumpff(z) {
  if (z > 1e-8) { const s = Math.sqrt(z); return [(s - Math.sin(s)) / s ** 3, (1 - Math.cos(s)) / z]; }
  if (z < -1e-8) { const s = Math.sqrt(-z); return [(Math.sinh(s) - s) / s ** 3, (Math.cosh(s) - 1) / -z]; }
  return [1 / 6, 1 / 2];
}
function universalFG(r0, v0, dt, mu) {
  const rn = norm(r0), vr = dot(r0, v0) / rn, alpha = 2 / rn - dot(v0, v0) / mu, sm = Math.sqrt(mu);
  let x = sm * Math.abs(alpha) * dt;
  for (let it = 0; it < 100; it++) {
    const z = alpha * x * x, [S, C] = stumpff(z);
    const F = rn * vr / sm * x * x * C + (1 - alpha * rn) * x ** 3 * S + rn * x - sm * dt;
    const dF = rn * vr / sm * x * (1 - alpha * x * x * S) + (1 - alpha * rn) * x * x * C + rn;
    const dx = F / dF;
    x -= dx;
    if (Math.abs(dx) < 1e-13) break;
  }
  const [S, C] = stumpff(alpha * x * x);
  return [1 - x * x / rn * C, dt - x ** 3 / sm * S];
}
/** Real roots of a polynomial (coefficients, highest power first), by companion-free Durand-Kerner iteration. */
function realRoots(c) {
  const n = c.length - 1, a = c.map((v) => v / c[0]);
  let z = Array.from({ length: n }, (_, k) => {
    const ang = 2 * Math.PI * k / n + 0.4;
    return [2 * Math.cos(ang), 2 * Math.sin(ang)];
  });
  const scale = Math.max(1, ...a.slice(1).map((v, k) => Math.abs(v) ** (1 / (k + 1)))) * 1.5;
  z = z.map(([re, im]) => [re * scale, im * scale]);
  const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  const div = (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
  for (let it = 0; it < 2000; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let p = [1, 0];
      for (let k = 1; k <= n; k++) p = [mul(p, zi)[0] + a[k], mul(p, zi)[1]];
      let d = [1, 0];
      z.forEach((zj, j) => { if (j !== i) d = mul(d, [zi[0] - zj[0], zi[1] - zj[1]]); });
      const s = div(p, d);
      moved = Math.max(moved, Math.hypot(s[0], s[1]) / Math.max(1e-300, Math.hypot(zi[0], zi[1])));
      return [zi[0] - s[0], zi[1] - s[1]];
    });
    if (moved < 1e-15) break;
  }
  return z.filter(([re, im]) => Math.abs(im) < 1e-8 * Math.max(1, Math.abs(re))).map(([re]) => re).sort((p, q) => p - q);
}

/**
 * Gauss's method from three observations ks (indices). Returns one solution
 * per positive root of the eighth-degree polynomial for the middle heliocentric
 * distance: { root, rho2 (distance from the observer, au), t (middle time, corrected for light
 * time), xh (heliocentric state at t) }. Light time is allowed for in the refinement.
 */
export function gauss(m, ks) {
  const mu = m.gm[0], O = ks.map((k) => m.obs[k]), t = O.map((o) => o.t);
  const L = O.map((o) => unit(o.ra, o.dec));
  const R = O.map((o) => { const s = sunState(m, o.t); return [o.site[0] - s[0], o.site[1] - s[1], o.site[2] - s[2]]; });
  const t1 = t[0] - t[1], t3 = t[2] - t[1], tau = t3 - t1;
  const p = [cross(L[1], L[2]), cross(L[0], L[2]), cross(L[0], L[1])];
  const D0 = dot(L[0], p[0]);
  const D = R.map((Ri) => p.map((pj) => dot(Ri, pj)));
  const A = (-D[0][1] * t3 / tau + D[1][1] + D[2][1] * t1 / tau) / D0;
  const B = (D[0][1] * (t3 * t3 - tau * tau) * t3 / tau + D[2][1] * (tau * tau - t1 * t1) * t1 / tau) / (6 * D0);
  const E = dot(R[1], L[1]), R2 = dot(R[1], R[1]);
  const a = -(A * A + 2 * A * E + R2), b = -2 * mu * B * (A + E), c = -((mu * B) ** 2);
  const out = [];
  for (const x of realRoots([1, 0, a, 0, 0, b, 0, 0, c]).filter((v) => v > 0)) {
    let f1 = 1 - mu * t1 * t1 / (2 * x ** 3), f3 = 1 - mu * t3 * t3 / (2 * x ** 3);
    let g1 = t1 - mu * t1 ** 3 / (6 * x ** 3), g3 = t3 - mu * t3 ** 3 / (6 * x ** 3);
    if (A + mu * B / x ** 3 <= 0) continue;
    let rho = [0, 0, 0], r = [], v2 = [], tc = t.slice();
    for (let it = 0; it < 200; it++) {
      const den = f1 * g3 - f3 * g1, c1 = g3 / den, c3 = -g1 / den;
      rho = [(-D[0][0] + D[1][0] / c1 - D[2][0] * c3 / c1) / D0,
        (-c1 * D[0][1] + D[1][1] - c3 * D[2][1]) / D0,
        (-D[0][2] * c1 / c3 + D[1][2] / c3 - D[2][2]) / D0];
      r = R.map((Ri, i) => Ri.map((v, k) => v + rho[i] * L[i][k]));
      v2 = r[0].map((_, k) => (-f3 * r[0][k] + f1 * r[2][k]) / den);
      // light time: the asteroid was where it was seen at t_i - rho_i / c
      tc = t.map((ti, i) => ti - rho[i] / m.c);
      const [f1n, g1n] = universalFG(r[1], v2, tc[0] - tc[1], mu), [f3n, g3n] = universalFG(r[1], v2, tc[2] - tc[1], mu);
      const done = Math.max(Math.abs(f1n - f1), Math.abs(f3n - f3), Math.abs(g1n - g1), Math.abs(g3n - g3)) < 1e-12;
      f1 = (f1 + f1n) / 2; g1 = (g1 + g1n) / 2; f3 = (f3 + f3n) / 2; g3 = (g3 + g3n) / 2;
      if (done) break;
    }
    if (!(rho[1] > 0) || !r[1].every(Number.isFinite) || !v2.every(Number.isFinite)) continue;
    out.push({ root: x, rho2: rho[1], t: tc[1], xh: [...r[1], ...v2] });
  }
  return out;
}

/**
 * Miss distances (arcsec) of every observation from a two-body (Sun only) orbit, given as a
 * heliocentric state xh at time t0, with light-time correction: how well a Gauss orbit fits.
 */
export function keplerMisses(m, xh, t0) {
  const mu = m.gm[0], r0 = xh.slice(0, 3), v0 = xh.slice(3);
  const at = (tq) => { const [f, g] = universalFG(r0, v0, tq - t0, mu); return r0.map((v, k) => f * v + g * v0[k]); };
  return m.obs.map((o) => {
    const s = sunState(m, o.t), R = [o.site[0] - s[0], o.site[1] - s[1], o.site[2] - s[2]];
    let tau = 0, rel = [0, 0, 0];
    for (let it = 0; it < 3; it++) { const p = at(o.t - tau); rel = p.map((v, k) => v - R[k]); tau = norm(rel) / m.c; }
    const L = unit(o.ra, o.dec), c = Math.min(1, dot(rel, L) / norm(rel));
    return Math.acos(c) / AS;
  });
}

/** Heliocentric state at time t to barycentric. */
export function toBary(m, xh, t) { const s = sunState(m, t); return xh.map((v, k) => v + s[k]); }

// ------------------------------------------------------------------ one tracklet: the admissible region
/** Linear fit of RA and Dec against time over the observations ks: { t, ra, dec, rad, decd } (rad, rad/day). */
export function attributable(m, ks) {
  const O = ks.map((k) => m.obs[k]), n = O.length;
  const t0 = O.reduce((s, o) => s + o.t, 0) / n;
  const ra0 = O[0].ra;
  const lin = (ys) => {
    let st = 0, sy = 0, stt = 0, sty = 0;
    O.forEach((o, i) => { const dt = o.t - t0; st += dt; sy += ys[i]; stt += dt * dt; sty += dt * ys[i]; });
    const slope = (n * sty - st * sy) / (n * stt - st * st);
    return [(sy - slope * st) / n, slope];
  };
  const ras = O.map((o) => { let d = o.ra - ra0; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return ra0 + d; });
  const [ra, rad] = lin(ras), [dec, decd] = lin(O.map((o) => o.dec));
  return { t: t0, ra, dec, rad, decd };
}
/** Observatory barycentric state at time t, interpolated linearly between the tracklet's observations. */
export function siteAt(m, ks, t) {
  const O = ks.map((k) => m.obs[k]);
  const out = new Array(6);
  for (let j = 0; j < 6; j++) {
    let i = 0;
    while (i < O.length - 2 && O[i + 1].t < t) i++;
    const a = O[i], b = O[i + 1] || O[i];
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out[j] = a.site[j] + f * (b.site[j] - a.site[j]);
  }
  return out;
}
/** Barycentric state implied by an attributable for a guessed distance rho (au) and range rate rhod (au/day). */
export function stateFrom(att, site, rho, rhod) {
  const { ra, dec, rad, decd } = att;
  const L = unit(ra, dec);
  const ea = [-Math.sin(ra), Math.cos(ra), 0];
  const ed = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const r = site.slice(0, 3).map((s, k) => s + rho * L[k]);
  const v = site.slice(3).map((s, k) => s + rhod * L[k] + rho * (rad * Math.cos(dec) * ea[k] + decd * ed[k]));
  return [...r, ...v];
}
/**
 * Range rates (au/day) between which an orbit at distance rho is bound to the Sun
 * (negative heliocentric energy): the admissible region of Milani et al. (2004),
 * without the inner limits. Returns null if no range rate gives a bound orbit.
 */
export function rhodotLimits(m, att, site, rho) {
  const s = sunState(m, att.t);
  const x0 = stateFrom(att, site, rho, 0).map((v, k) => v - s[k]);
  const L = unit(att.ra, att.dec);
  const r = norm(x0.slice(0, 3)), W = x0.slice(3);
  const wl = dot(W, L), disc = wl * wl - (dot(W, W) - 2 * m.gm[0] / r);
  if (disc <= 0) return null;
  return [-wl - Math.sqrt(disc), -wl + Math.sqrt(disc)];
}
/** True when an orbit would be bound to the Earth (geocentric energy below zero inside the Earth's Hill sphere). */
export function earthBound(m, x, t) {
  const p = [0, 0, 0], v = [0, 0, 0];
  bodyState(m, 3, t, p, v);
  const d = norm([x[0] - p[0], x[1] - p[1], x[2] - p[2]]);
  const vv = (x[3] - v[0]) ** 2 + (x[4] - v[1]) ** 2 + (x[5] - v[2]) ** 2;
  return d < 0.0098 && vv / 2 - m.gm[3] / d < 0;
}
