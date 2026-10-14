// The five reference frames of the MPC tutorial "Reference Frames for Solar
// System Dynamics", derived by pure post-processing of stored barycentric
// positions (ecliptic x, y). Nothing here re-integrates anything.

/** Rotate a 2-D point by -theta, i.e. undo a rotation theta. */
function unrotate(x, y, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [c * x + s * y, -s * x + c * y];
}

/**
 * Least-squares fit of lambda(t) = lambda0 + n t through a planet's unwrapped
 * heliocentric longitude: the rotation of the uniform synodic frame.
 */
export function fitMeanMotion(t, px, py) {
  let prev = Math.atan2(py[0], px[0]), offset = 0;
  let st = 0, sl = 0, stt = 0, stl = 0;
  for (let k = 0; k < t.length; k++) {
    let lam = Math.atan2(py[k], px[k]);
    if (k > 0) {
      if (lam - prev > Math.PI) offset -= 2 * Math.PI;
      else if (lam - prev < -Math.PI) offset += 2 * Math.PI;
    }
    prev = lam;
    lam += offset;
    st += t[k]; sl += lam; stt += t[k] * t[k]; stl += t[k] * lam;
  }
  const N = t.length;
  const n = (N * stl - st * sl) / (N * stt - st * st);
  return { lambda0: (sl - n * st) / N, n };
}

/**
 * Build all five frames relative to a reference planet.
 * @param {{t: Float64Array, sun: Float64Array, planet: Float64Array, targets: Record<string, Float64Array>}} d
 *   Barycentric xy series, interleaved [x0, y0, x1, y1, ...].
 * @returns {{frames: Record<string, Record<string, Float64Array>>, meanMotion: number, lambda0: number}}
 *   frames[frame][key] for key "sun", "planet" and each target key.
 */
export function buildFrames({ t, sun, planet, targets }) {
  const N = t.length;
  const pts = { sun, planet, ...targets };
  const keys = Object.keys(pts);
  const make = () => Object.fromEntries(keys.map((k) => [k, new Float64Array(2 * N)]));
  const f = { barycentric: make(), heliocentric: make(), planetocentric: make(), corotating: make(), synodic: make() };

  const hx = new Float64Array(N), hy = new Float64Array(N);
  for (let k = 0; k < N; k++) { hx[k] = planet[2 * k] - sun[2 * k]; hy[k] = planet[2 * k + 1] - sun[2 * k + 1]; }
  const { lambda0, n } = fitMeanMotion(t, hx, hy);

  for (let k = 0; k < N; k++) {
    const i = 2 * k, j = i + 1;
    const theta = Math.atan2(hy[k], hx[k]);
    const lam = lambda0 + n * t[k];
    for (const key of keys) {
      const bx = pts[key][i], by = pts[key][j];
      // 1. Inertial barycentric: as stored.
      f.barycentric[key][i] = bx; f.barycentric[key][j] = by;
      // 2. Inertial heliocentric: subtract the Sun.
      const sx = bx - sun[i], sy = by - sun[j];
      f.heliocentric[key][i] = sx; f.heliocentric[key][j] = sy;
      // 3. Planet-centred, non-rotating: subtract the planet.
      f.planetocentric[key][i] = bx - planet[i]; f.planetocentric[key][j] = by - planet[j];
      // 4. Co-rotating (pinned): heliocentric, rotated by the planet's true longitude.
      [f.corotating[key][i], f.corotating[key][j]] = unrotate(sx, sy, theta);
      // 5. Uniform synodic: heliocentric, rotated at the planet's mean motion.
      [f.synodic[key][i], f.synodic[key][j]] = unrotate(sx, sy, lam);
    }
  }
  return { frames: f, meanMotion: n, lambda0 };
}
