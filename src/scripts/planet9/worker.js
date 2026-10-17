// Evolves one TNO's secular equations off the main thread.
//   {id, a, el: {e, i, w, O} (radians), p9: {...}, tEnd, nOut}: posts
//   {type: 'out', id, t, el} for each output, {type: 'progress', id, f}, then {type: 'done', id, ms, tStop, stopped}.
import { Secular, evolve, toVectors, toElements } from './physics.js';

self.onmessage = ({ data: msg }) => {
  const t0 = performance.now();
  const sec = new Secular(msg.a, msg.p9);
  let last = 0;
  const { tStop } = evolve(sec, toVectors(msg.el.e, msg.el.i, msg.el.w, msg.el.O), msg.tEnd, msg.nOut, {
    onOut: (t, y) => {
      const el = toElements(y);
      const varpi9 = (sec.w9 + sec.O9 + (sec.dw9 + sec.dO9) * t) % (2 * Math.PI);
      self.postMessage({ type: 'out', id: msg.id, t, el, varpi9 });
    },
    onProgress: (f) => { if (f - last > 0.01) { last = f; self.postMessage({ type: 'progress', id: msg.id, f }); } }
  });
  self.postMessage({ type: 'done', id: msg.id, ms: performance.now() - t0, tStop, stopped: tStop < msg.tEnd });
};
