// Validate src/scripts/rvlaplace/physics.js against REBOUND (reference.py) for GJ 876.
//   node tools/validate_rvlaplace/compare.mjs
import { readFileSync } from 'node:fs';
import { gj876Angles, amplitude, jacobiSetup, advance, starRV, GJ876, M_EARTH } from '../../src/scripts/rvlaplace/physics.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const DEG = Math.PI / 180;
const wrapd = (x) => Math.abs(((x + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / DEG;
for (const f of ['0.2', '1.0', '5.0']) {
  const t0 = performance.now();
  const js = gj876Angles({ years: 60, nOut: 3000, eMass: Number(f) });
  const ms = performance.now() - t0;
  const pairs = [['cb_c', 'phi_cb_c'], ['cb_b', 'phi_cb_b'], ['be_b', 'phi_be_b'], ['laplace', 'laplace']];
  const parts = pairs.map(([j, p]) => {
    let worst = 0;
    for (let k = 0; k < 3000; k++) worst = Math.max(worst, wrapd(js[j][k] - ref[f][p][k]));
    const a = amplitude(js[j]), b = ref[f].amp[p];
    return `${p}: amp JS ${a === null ? 'circ' : a.toFixed(2)} / REBOUND ${b === null ? 'circ' : b.toFixed(2)} deg, max diff ${worst.toFixed(3)} deg`;
  });
  console.log(`planet e mass x${f} (${ms.toFixed(0)} ms):\n  ` + parts.join('\n  '));
}
const pl = GJ876.planets.map((p) => ({ m: p.m * M_EARTH, a: p.a, e: p.e, inc: GJ876.inc * DEG, Omega: 0, omega: p.omega * DEG, M: p.M * DEG }));
const { y, m } = jacobiSetup(GJ876.mStar, pl);
let worst = 0;
for (let k = 0; k < ref.rv.t.length; k++) {
  if (k) advance(y, m, 0.025, 20);
  worst = Math.max(worst, Math.abs(starRV(y) - ref.rv.rv[k]));
}
console.log(`stellar RV over 200 days: max difference ${worst.toExponential(2)} m/s`);
