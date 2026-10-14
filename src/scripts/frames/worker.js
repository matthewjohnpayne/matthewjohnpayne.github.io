// Runs the integration off the main thread and returns the barycentric xy
// series needed by the frames: the Sun, Earth, Jupiter and every asteroid.
import { integrate } from './nbody.js';

self.onmessage = ({ data: { ic, years, dt, sampleDays } }) => {
  const t0 = performance.now();
  const out = integrate(ic, { years, dt, sampleDays });
  const ms = performance.now() - t0;
  const nk = out.keys.length, N = out.t.length;
  const pick = (key) => {
    const j = out.keys.indexOf(key), xy = new Float64Array(2 * N);
    for (let k = 0; k < N; k++) { xy[2 * k] = out.xyz[(k * nk + j) * 3]; xy[2 * k + 1] = out.xyz[(k * nk + j) * 3 + 1]; }
    return xy;
  };
  const xy = Object.fromEntries(['sun', 'earth', 'jupiter', ...ic.particles.map((p) => p.key)].map((k) => [k, pick(k)]));
  self.postMessage({ t: out.t, xy, ms }, [out.t.buffer, ...Object.values(xy).map((a) => a.buffer)]);
};
