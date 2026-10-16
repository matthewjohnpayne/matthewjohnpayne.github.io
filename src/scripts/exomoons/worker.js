// Integrates test moons through one planet-planet encounter, off the main thread.
//   {id, flyby: {q, vq, mp, tSim}, moons: [...]}: posts {type: 'moon', id, k, result}
//   after each moon, then {type: 'done', id, ms}.
import { flybyStart, runMoon } from './physics.js';

let current = 0;
self.onmessage = ({ data: msg }) => {
  current = msg.id;
  const t0 = performance.now();
  const start = flybyStart(msg.flyby);
  for (let k = 0; k < msg.moons.length; k++) {
    if (current !== msg.id) return;
    const result = runMoon(start, msg.moons[k], msg.flyby.tSim, msg.flyby.mp);
    self.postMessage({ type: 'moon', id: msg.id, k, result });
  }
  self.postMessage({ type: 'done', id: msg.id, ms: performance.now() - t0 });
};
