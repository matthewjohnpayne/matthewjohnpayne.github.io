// Integrates systems off the main thread.
//   {id, systems: [params, ...]}: posts {type: 'progress', id, f} as it goes,
//   then {type: 'result', id, runs: [{times, resid, rms, P}], ms}.
import { transitTimes, ttv } from './physics.js';

self.onmessage = ({ data: msg }) => {
  const t0 = performance.now();
  const n = msg.systems.length;
  const runs = msg.systems.map((p, k) => {
    const times = transitTimes(p, { onProgress: (f) => self.postMessage({ type: 'progress', id: msg.id, f: (k + f) / n }) });
    const { resid, rms, P } = ttv(times);
    return { times, resid, rms, P };
  });
  self.postMessage({ type: 'result', id: msg.id, runs, ms: performance.now() - t0 });
};
