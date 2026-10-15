// Validate src/scripts/ttv/physics.js against the science-notebooks TTV module
// (REBOUND, IAS15). Needs reference.json from reference.py.
//   node tools/validate_ttv/compare.mjs [stepsPerOrbit]
import { readFileSync } from 'node:fs';
import * as tv from '../../src/scripts/ttv/physics.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const steps = Number(process.argv[2] || 60);
let maxIc = 0;
const rows = [];
const t0 = performance.now();
for (const r of ref) {
  const [aRatio, e2, inc2, omega2, Omega2, M2] = r.job;
  const p = { aRatio, e2, inc2, omega2, Omega2, M2 };
  const { m, y } = tv.initialState(p);
  const b = tv.barycentric(y, m);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) maxIc = Math.max(maxIc, Math.abs(b[i][k] - r.bary[i][k]));
  const js = tv.transitTimes(p, { stepsPerOrbit: steps });
  const py = Float64Array.from(r.times);
  const n = Math.min(js.length, py.length);
  let dmax = 0;
  for (let i = 0; i < n; i++) dmax = Math.max(dmax, Math.abs(js[i] - py[i]) * tv.DAY_S);
  rows.push({ job: r.job, nJs: js.length, nPy: py.length, dmax, rmsJs: tv.ttv(js).rms, rmsPy: tv.ttv(py).rms });
}
const ms = (performance.now() - t0) / ref.length;
console.log(`Initial barycentric states: max |diff| ${maxIc.toExponential(1)}`);
console.log(`${steps} steps per orbit; ${ms.toFixed(0)} ms per system`);
let worst = 0, sameCount = 0;
for (const r of rows) {
  const rel = Math.abs(r.rmsJs - r.rmsPy) / Math.max(r.rmsPy, 1e-3);
  worst = Math.max(worst, rel);
  sameCount += r.nJs === r.nPy;
  const flag = rel > 0.05 ? '  <--' : '';
  console.log(`a2/a1 ${r.job[0].toFixed(3)} e2 ${r.job[1].toFixed(3)} i2 ${(r.job[2] * 180 / Math.PI).toFixed(0).padStart(3)}: transits ${r.nJs}/${r.nPy}, max |dt| ${r.dmax.toFixed(4)} s, RMS TTV ${r.rmsJs.toPrecision(4)} vs ${r.rmsPy.toPrecision(4)} s${flag}`);
}
const rel = rows.map((r) => Math.abs(r.rmsJs - r.rmsPy) / Math.max(r.rmsPy, 1e-3)).sort((a, b) => a - b);
console.log(`Same number of transits: ${sameCount}/${rows.length}. RMS TTV relative difference: median ${rel[rel.length >> 1].toExponential(1)}, worst ${worst.toExponential(1)}`);
