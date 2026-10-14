// Runs two-planet integrations off the main thread.
//   {type: 'orbit', id, params}: one orbit, posting {type: 'progress', id, f}
//     as it goes, then {type: 'orbit', id, logT, lnD, samples}.
//   {type: 'pixels', jobs: [{i, ...params}]}: map pixels, posting
//     {type: 'pixels', results: [[i, logT], ...]}.
import { lyapunovTime } from './physics.js';

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'orbit') {
    const samples = [];
    const nSamples = 400;
    const t0 = performance.now();
    const logT = lyapunovTime({
      ...msg.params, nSamples,
      onSample: (s) => {
        samples.push(s);
        if (samples.length % 40 === 0) self.postMessage({ type: 'progress', id: msg.id, f: samples.length / (nSamples + 1) });
      }
    });
    self.postMessage({ type: 'orbit', id: msg.id, logT, samples, ms: performance.now() - t0 });
  } else if (msg.type === 'pixels') {
    const results = msg.jobs.map((j) => [j.i, lyapunovTime(j)]);
    self.postMessage({ type: 'pixels', results });
  }
};
