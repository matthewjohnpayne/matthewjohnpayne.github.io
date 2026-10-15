// Runs one sampler on the N-body posterior of the RUN DMC page, off the main thread, and
// streams the periods of planets c and b back for plotting.
import { makePosterior, demcmcGeneration, randomWalkStep, rng } from './model.js';

self.onmessage = ({ data: { kind, data, budget, scale, seed } }) => {
  const logp = makePosterior(data, data.m_star);
  const R = rng(seed);
  const P = (x) => [Math.expm1(x[0]), Math.expm1(x[5])];
  let last = performance.now(), batch = [], nAcc = 0, nProp = 0;
  const flush = (done, extra = {}) => { self.postMessage({ kind, batch, evals: logp.count, acc: nAcc / Math.max(nProp, 1), done, ...extra }); batch = []; last = performance.now(); };
  if (kind === 'rw') {
    const st = { x: data.map.slice(), lp: 0 };
    st.lp = logp(st.x);
    const scales = data.sd.map((s) => s * scale);
    while (logp.count < budget) {
      nAcc += randomWalkStep(logp, st, scales, R); nProp += 1;
      batch.push([logp.count, ...P(st.x), 0, 0, ...st.x]);
      if (performance.now() - last > 200) flush(false);
    }
  } else {
    const nCh = 3 * data.map.length;
    const st = { x: [], lp: [], gamma0: 2.38 / Math.sqrt(2 * data.map.length), g: 0 };
    for (let i = 0; i < nCh; i++) st.x.push(data.best.map((v) => v + 1e-4 * R.n() * Math.max(Math.abs(v), 1)));   // as the notebook
    st.lp = st.x.map(logp);
    while (logp.count + nCh <= budget) {
      const f = demcmcGeneration(logp, st, R);
      nAcc += f * nCh; nProp += nCh;
      for (let i = 0; i < nCh; i++) batch.push([logp.count, ...P(st.x[i]), i, st.g, ...st.x[i]]);
      if (performance.now() - last > 200) flush(false);
    }
  }
  flush(true);
};
