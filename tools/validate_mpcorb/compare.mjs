// Check src/scripts/mpcorb/orbit.js against tools/validate_mpcorb/reference.json (reference.py):
// element conversions against the files' own COM and KEP blocks, two-body propagation against
// REBOUND, and Monte Carlo clones against the files' cometary uncertainties.
//     node tools/validate_mpcorb/compare.mjs
import { readFileSync } from 'node:fs';
import { unwrap, block, stateToElements, propagate, sampleStates, GM } from '../../src/scripts/mpcorb/orbit.js';

const dir = new URL('../../public/data/mpc_orb/', import.meta.url);
const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const index = JSON.parse(readFileSync(new URL('index.json', dir)));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
let worst = { el: 0, prop: 0, mc: 0 };
for (const { key } of index) {
  const o = unwrap(JSON.parse(readFileSync(new URL(`${key}.json`, dir))));
  const car = block(o, 'CAR'), com = block(o, 'COM'), kep = block(o, 'KEP');
  const el = stateToElements(car.values.slice(0, 6), o.epoch_data.epoch);
  // relative for q, e, a; degrees for angles; days for peri_time
  const dCom = el.COM.map((v, i) => (i === 0 || i === 1 ? Math.abs(v / com.values[i] - 1) : i === 5 ? Math.abs(v - com.values[i]) : angle(v, com.values[i])));
  const dKep = el.KEP && kep.values[0] > 0 ? el.KEP.map((v, i) => (i <= 1 ? Math.abs(v / kep.values[i] - 1) : angle(v, kep.values[i]))) : [];
  const dEl = Math.max(...dCom, ...dKep);
  // two-body propagation vs REBOUND, position difference in km
  const dProp = Math.max(...ref[key].prop.map(({ dt, s }) => { const p = propagate(car.values, dt); return Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]) * 1.495978707e8; }));
  // clones: std of q, e, i against the file
  const clones = sampleStates(car, 4000, 7).map((s) => stateToElements(s, o.epoch_data.epoch).COM);
  const std = (k) => { const m = clones.reduce((a, c) => a + c[k], 0) / clones.length; return Math.sqrt(clones.reduce((a, c) => a + (c[k] - m) ** 2, 0) / clones.length); };
  const ratios = [0, 1, 2].map((k) => std(k) / com.unc[k]);
  const dMc = Math.max(...ratios.map((r) => Math.abs(r - 1)));
  worst = { el: Math.max(worst.el, dEl), prop: Math.max(worst.prop, dProp), mc: Math.max(worst.mc, dMc) };
  console.log(`${key.padEnd(8)} elements vs file: max diff ${dEl.toExponential(1)} (rel. / deg / day); propagation vs REBOUND: ${dProp.toExponential(1)} km; clone sigma / file sigma (q,e,i): ${ratios.map((r) => r.toFixed(3)).join(', ')}`);
}
console.log(`\nworst: elements ${worst.el.toExponential(1)}, propagation ${worst.prop.toExponential(1)} km, clone sigmas within ${(100 * worst.mc).toFixed(1)}% (GM = ${GM})`);
