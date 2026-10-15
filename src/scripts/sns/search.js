// Catalogue shift-and-stack after Stetzler et al. (2025, AJ 170, 352; S25), as in the
// science-notebooks module notebooks/shift_and_stack/sns.py: project every detection back to
// the first epoch for each trial velocity, histogram in bins of dx, and repeatedly take the
// fullest bin. Validated against the notebook by tools/validate_sns/.
// Units: pixels and hours. A catalogue is {x, y, t} (Float64Arrays).

/** All trial velocities on a square grid of spacing dv with vMin <= |v| <= vMax (as sns.velocity_grid). */
export function velocityGrid(vMin, vMax, dv) {
  const vx = [], vy = [];
  const n = Math.round((2 * vMax) / dv);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const gx = -vMax + j * dv, gy = -vMax + i * dv, s = Math.hypot(gx, gy);
      if (s >= vMin - dv / 2 && s <= vMax + dv / 2) { vx.push(gx); vy.push(gy); }
    }
  }
  return { vx, vy };
}

/** Histogram of a catalogue projected along one trial velocity: returns {counts, nb, lo}. */
export function stack(cat, vx, vy, dx, vMax, dt, size) {
  const t0 = Math.min(...cat.t);
  const lo = -vMax * dt - dx;
  const nb = Math.ceil((size + 2 * vMax * dt + 2 * dx) / dx);
  const counts = new Uint16Array(nb * nb);
  for (let k = 0; k < cat.x.length; k++) {
    const tt = cat.t[k] - t0;
    const px = Math.floor((cat.x[k] - vx * tt - lo) / dx), py = Math.floor((cat.y[k] - vy * tt - lo) / dx);
    if (px >= 0 && py >= 0 && px < nb && py < nb) counts[px * nb + py] += 1;
  }
  return { counts, nb, lo };
}

/** S25's search (sns.catalog_search): clusters of at least nMin detections, fullest first. */
export function search(cat, dx, vMin, vMax, nMin, maxResults, size) {
  const n = cat.x.length;
  let t0 = Infinity, t1 = -Infinity;
  for (const v of cat.t) { t0 = Math.min(t0, v); t1 = Math.max(t1, v); }
  const dt = t1 - t0;
  const { vx, vy } = velocityGrid(vMin, vMax, dx / dt);
  const alive = new Uint8Array(n).fill(1);
  const lo = -vMax * dt - dx;
  const nb = Math.ceil((size + 2 * vMax * dt + 2 * dx) / dx);
  const counts = new Uint16Array(nb * nb);
  const cell = new Int32Array(n);
  function best(j) {
    counts.fill(0);
    let bk = 0, bc = 0;
    for (let k = 0; k < n; k++) {
      if (!alive[k]) { cell[k] = -1; continue; }
      const tt = cat.t[k] - t0;
      const c = Math.floor((cat.x[k] - vx[j] * tt - lo) / dx) * nb + Math.floor((cat.y[k] - vy[j] * tt - lo) / dx);
      cell[k] = c;
      const v = ++counts[c];
      if (v > bc || (v === bc && c < bk)) { bc = v; bk = c; }
    }
    return { n: bc, k: bk };
  }
  const maxima = Float64Array.from(vx, (_, j) => best(j).n);
  const results = [];
  let guard = 0;
  while (results.length < maxResults && guard++ < 100000) {
    let j = 0;
    for (let i = 1; i < maxima.length; i++) if (maxima[i] > maxima[j]) j = i;
    const b = best(j);
    if (b.n !== maxima[j]) { maxima[j] = b.n; continue; }
    if (b.n < nMin) break;
    const members = [];
    for (let k = 0; k < n; k++) if (cell[k] === b.k) { members.push(k); alive[k] = 0; }
    results.push({ members, vx: vx[j], vy: vy[j], n: b.n });
    maxima[j] = best(j).n;
  }
  return { results, nVelocities: vx.length };
}

/** Least-squares line through a cluster: x0, y0 (at t = 0), vx, vy. */
export function fitLine(cat, members) {
  let st = 0, sx = 0, sy = 0, stt = 0, stx = 0, sty = 0;
  for (const k of members) { const t = cat.t[k]; st += t; sx += cat.x[k]; sy += cat.y[k]; stt += t * t; stx += t * cat.x[k]; sty += t * cat.y[k]; }
  const m = members.length, den = m * stt - st * st;
  const vx = (m * stx - st * sx) / den, vy = (m * sty - st * sy) / den;
  return { x0: (sx - vx * st) / m, y0: (sy - vy * st) / m, vx, vy };
}
