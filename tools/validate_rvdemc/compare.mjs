// Validate src/scripts/rvdemc/model.js against the notebook's REBOUND model (reference.json and
// src/data/rvdemc.json, both written by tools/export_rvdemc_data.py).
//   node tools/validate_rvdemc/compare.mjs
import { readFileSync } from 'node:fs';
import { makePosterior, nbodyRV, keplerianRV } from '../../src/scripts/rvdemc/model.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const dat = JSON.parse(readFileSync(new URL('../../src/data/rvdemc.json', import.meta.url)));
const fine = Float64Array.from(ref.fine);
const dNb = nbodyRV(dat.truth, fine, dat.m_star).reduce((m, v, k) => Math.max(m, Math.abs(v - ref.rv_truth_nbody[k])), 0);
const dKp = keplerianRV(dat.truth, fine).reduce((m, v, k) => Math.max(m, Math.abs(v - ref.rv_truth_kepler[k])), 0);
console.log(`true orbits over 1,500 days: N-body RV max difference ${dNb.toExponential(2)} m/s; Keplerian ${dKp.toExponential(2)} m/s`);
const post = makePosterior(dat, dat.m_star);
const t0 = performance.now();
const lps = ref.x.map((x) => post(x));
console.log('log posterior JS vs REBOUND:', lps.map((v, i) => `${v.toFixed(4)} / ${ref.logp[i].toFixed(4)}`).join(';  '));
for (let i = 0; i < 50; i++) post(ref.x[0]);
const n = 300;
const t1 = performance.now();
for (let i = 0; i < n; i++) post(ref.x[0]);
console.log(`${((performance.now() - t1) / n).toFixed(2)} ms per N-body posterior evaluation`);
