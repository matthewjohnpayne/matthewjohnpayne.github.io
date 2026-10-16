// Validate src/scripts/cassini/model.js against the science-notebooks module
// notebooks/cassini_planet9/cassini.py. Needs reference.json from tools/export_cassini_data.py.
//   node tools/validate_cassini/compare.mjs
import { readFileSync } from 'node:fs';
import * as M from '../../src/scripts/cassini/model.js';

const data = JSON.parse(readFileSync(new URL('../../public/data/cassini/basis.json', import.meta.url)));
const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const G = M.gram(data.basis);
let worst = 0;
for (const name of ['A', 'B', 'C', 'D', 'E']) {
  const r = ref[name], n = M.unit(r.ra, r.dec);
  const d1 = M.dchi2(M.signature(data.basis, n, 1e-12), data.sigma);
  const d2 = (1e-12 / M.limit(G, n, data.sigma, 1)) ** 2;
  worst = Math.max(worst, Math.abs(d1 / r.dchi2_1e12 - 1), Math.abs(d2 / r.dchi2_1e12 - 1));
  console.log(`${name}: Delta chi^2 at k = 1e-12: page ${d1.toFixed(1)} (via Gram ${d2.toFixed(1)}), notebook ${r.dchi2_1e12.toFixed(1)}`);
}
const i60 = data.nominal.nu.indexOf(60), [ra, dec] = data.nominal.radec[i60], rr = data.nominal.r[i60];
const s = M.signature(data.basis, M.unit(ra, dec), 10 * data.m_earth / rr ** 3);
const ds = Math.max(...s.map((v, i) => Math.abs(v - ref.nu60.signature[i])));
console.log(`Nominal orbit, nu = 60 deg: max |signature difference| ${ds.toFixed(3)} m (signature up to ${Math.max(...s.map(Math.abs)).toFixed(0)} m)`);
console.log(`Largest relative difference in Delta chi^2: ${worst.toExponential(1)}`);
