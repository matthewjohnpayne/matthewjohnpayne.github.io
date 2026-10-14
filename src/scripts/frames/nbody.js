// Newtonian N-body integration for the reference-frames demonstration.
//
// Massive bodies (Sun, planets, Moon) interact with each other; asteroids are
// massless test particles. Units: AU, days, GM in AU^3/day^2. Integration is in
// the inertial barycentric frame, with a fixed-step symmetric composition of
// the drift-kick-drift leapfrog (Yoshida 1990, sixth order, solution A).
// No dependencies, so the same module runs in the browser and in Node.

const W = [0.784513610477560, 0.235573213359357, -1.17767998417887];
const W0 = 1 - 2 * (W[0] + W[1] + W[2]);
export const YOSHIDA6 = [W[0], W[1], W[2], W0, W[2], W[1], W[0]];

/**
 * Integrate from initial conditions and sample barycentric positions.
 * @param {object} ic          Parsed frames-ic.json.
 * @param {object} options
 * @param {number} options.years       Span to integrate.
 * @param {number} options.dt          Step in days.
 * @param {number} options.sampleDays  Output interval in days (a multiple of dt).
 * @returns {{t: Float64Array, keys: string[], xyz: Float64Array}}
 *   t in days from the epoch; xyz[(k * nKeys + j) * 3 + c] is coordinate c of
 *   body/particle j at sample k.
 */
export function integrate(ic, { years, dt, sampleDays }) {
  const nb = ic.bodies.length;
  const n = nb + ic.particles.length;
  const gm = Float64Array.from(ic.bodies, (b) => b.gm);
  const x = new Float64Array(3 * n);
  const v = new Float64Array(3 * n);
  const a = new Float64Array(3 * n);
  [...ic.bodies, ...ic.particles].forEach((b, i) => {
    for (let c = 0; c < 3; c++) { x[3 * i + c] = b.state[c]; v[3 * i + c] = b.state[3 + c]; }
  });

  function accelerations() {
    a.fill(0);
    for (let i = 0; i < nb; i++) {
      const xi = x[3 * i], yi = x[3 * i + 1], zi = x[3 * i + 2];
      for (let j = i + 1; j < n; j++) {
        const dx = x[3 * j] - xi, dy = x[3 * j + 1] - yi, dz = x[3 * j + 2] - zi;
        const r2 = dx * dx + dy * dy + dz * dz;
        const inv3 = 1 / (r2 * Math.sqrt(r2));
        // Body i pulls j; j pulls i only if j is massive.
        const fi = gm[i] * inv3;
        a[3 * j] -= fi * dx; a[3 * j + 1] -= fi * dy; a[3 * j + 2] -= fi * dz;
        if (j < nb) {
          const fj = gm[j] * inv3;
          a[3 * i] += fj * dx; a[3 * i + 1] += fj * dy; a[3 * i + 2] += fj * dz;
        }
      }
    }
  }
  function drift(h) { for (let k = 0; k < 3 * n; k++) x[k] += h * v[k]; }
  function kick(h) { for (let k = 0; k < 3 * n; k++) v[k] += h * a[k]; }

  function step(h) {
    // Consecutive half-drifts of adjacent leapfrog stages are merged.
    let pending = 0;
    for (const w of YOSHIDA6) {
      drift(pending + 0.5 * w * h);
      accelerations();
      kick(w * h);
      pending = 0.5 * w * h;
    }
    drift(pending);
  }

  const every = Math.round(sampleDays / dt);
  const nSamples = Math.floor((years * 365.25) / (every * dt)) + 1;
  const t = new Float64Array(nSamples);
  const xyz = new Float64Array(nSamples * n * 3);
  for (let k = 0; k < nSamples; k++) {
    if (k > 0) for (let s = 0; s < every; s++) step(dt);
    t[k] = k * every * dt;
    xyz.set(x, k * n * 3);
  }
  return { t, keys: [...ic.bodies, ...ic.particles].map((b) => b.key), xyz };
}
