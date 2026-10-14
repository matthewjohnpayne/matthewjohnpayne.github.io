// Runs the integration off the main thread and returns the xy series needed
// by the frames: Sun, Earth and Kamoʻoalewa, barycentric.
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
  const result = { t: out.t, sun: pick('sun'), earth: pick('earth'), target: pick('kamooalewa'), ms };
  self.postMessage(result, [result.t.buffer, result.sun.buffer, result.earth.buffer, result.target.buffer]);
};
