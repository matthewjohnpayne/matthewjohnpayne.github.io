// Validate src/scripts/overlap/physics.js against the science-notebooks
// resonance-overlap notebook. Needs reference.json from reference.py.
//   node tools/validate_overlap/compare.mjs [nSamples]
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as ov from '../../src/scripts/overlap/physics.js';

const here = new URL('.', import.meta.url);
const num = (v) => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);

if (!isMainThread) {
  for (const s of workerData) parentPort.postMessage({ ...s, js: ov.lyapunovTime(s) });
  parentPort.postMessage(null);
} else {
  const ref = JSON.parse(readFileSync(new URL('reference.json', here)));
  const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

  console.log('Initial conditions, energy, angular momentum, Hill margin');
  for (const s of ref.states) {
    const st = ov.twoPlanetState(s);
    const dy = Math.max(...s.y.map((v, k) => Math.abs(v - st.y[k])));
    const { E, L } = ov.energyAndMomentum(st.y, st.m);
    console.log(`  eps ${s.eps}, P2/P1 ${s.pr}: max |dy| ${dy.toExponential(1)}, dE/E ${rel(E, s.E).toExponential(1)}, dL/L ${rel(L, s.L).toExponential(1)}, Hill margin ${ov.hillMargin(st).toExponential(4)} vs ${s.hill_margin.toExponential(4)}`);
  }
  console.log('Hill boundary period ratio');
  for (const h of ref.hill) {
    const js = ov.hillPeriodRatio(h.eps, h);
    console.log(`  eps ${h.eps}, e1 ${h.e1}, M1 ${h.M1.toFixed(3)}: ${js.toFixed(6)} vs ${h.pr.toFixed(6)}`);
  }
  console.log('Separatrices (max relative difference at sampled points)');
  for (const r of ref.separatrix) {
    const [inner, outer] = ov.resonanceSeparatrix(r.eps, r.m);
    let worst = 0;
    r.k.forEach((k, i) => {
      worst = Math.max(worst, rel(inner.pr[k], r.inner_pr[i]), rel(inner.sigma[k], r.inner_sigma[i]),
        rel(outer.pr[k], r.outer_pr[i]), rel(outer.sigma[k], r.outer_sigma[i]));
    });
    console.log(`  eps ${r.eps}, ${r.m + 1}:${r.m}: ${worst.toExponential(1)}`);
  }

  const n = Number(process.argv[2] || ref.lyapunov.length);
  const samples = ref.lyapunov.slice(0, n).map((s) => ({ ...s, notebook: num(s.notebook) }));
  const nw = Math.max(1, cpus().length - 1);
  const t0 = performance.now();
  const results = [];
  await Promise.all(Array.from({ length: nw }, (_, w) => new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: samples.filter((_, i) => i % nw === w) });
    worker.on('message', (m) => { if (m) results.push(m); else { worker.terminate(); resolve(); } });
  })));
  const secs = (performance.now() - t0) / 1000;
  console.log(`Lyapunov times: ${results.length} map pixels in ${secs.toFixed(0)} s on ${nw} threads (${((secs * nw) / results.length).toFixed(2)} s each)`);
  // Classify as the colour scale reads: chaotic below log10 T = 2 (red and darker), regular above.
  const LO = 0.5, HI = 2.76, clip = (v) => Math.min(HI, Math.max(LO, v));
  const CUT = 2;
  const byMap = {};
  for (const r of results) {
    const g = (byMap[r.map] ||= { n: 0, agree: 0, diffs: [] });
    g.n++;
    if ((r.js < CUT) === (r.notebook < CUT)) g.agree++;
    g.diffs.push(Math.abs(clip(r.js) - clip(r.notebook)));
  }
  let N = 0, A = 0;
  for (const [k, g] of Object.entries(byMap).sort()) {
    g.diffs.sort((a, b) => a - b);
    N += g.n; A += g.agree;
    console.log(`  ${k}: chaotic/regular agree ${g.agree}/${g.n}; median |diff| ${g.diffs[g.n >> 1].toFixed(2)} dex, 90th percentile ${g.diffs[Math.floor(0.9 * g.n)].toFixed(2)} dex`);
  }
  console.log(`  all: ${A}/${N} (${((100 * A) / N).toFixed(1)}%) agree`);
  const bad = results.filter((r) => (r.js < CUT) !== (r.notebook < CUT));
  for (const r of bad.slice(0, 40)) console.log(`    disagree ${r.map} P2/P1 ${r.pr.toFixed(4)} e1 ${r.e1.toFixed(4)} M1 ${r.M1.toFixed(3)}: js ${r.js.toFixed(2)} notebook ${r.notebook.toFixed(2)}`);
}
