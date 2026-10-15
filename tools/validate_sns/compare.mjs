// Validate src/scripts/sns/search.js against the notebook's sns.catalog_search on the same
// catalogue. Needs reference.json from reference.py.
//   node tools/validate_sns/compare.mjs
import { readFileSync } from 'node:fs';
import { search } from '../../src/scripts/sns/search.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const cat = { x: Float64Array.from(ref.cat.x), y: Float64Array.from(ref.cat.y), t: Float64Array.from(ref.cat.t) };
const t0 = performance.now();
const { results, nVelocities } = search(cat, 4.0, 1.5, 21.0, 8, 60, 256);
const ms = performance.now() - t0;
const key = (r) => r.members.slice().sort((a, b) => a - b).join(',');
const pySet = new Set(ref.results.map(key));
const same = results.filter((r) => pySet.has(key(r))).length;
console.log(`${cat.x.length} detections; trial velocities JS ${nVelocities} vs Python ${ref.n_velocities}; `
  + `clusters JS ${results.length} vs Python ${ref.results.length}; identical membership for ${same}; ${ms.toFixed(0)} ms`);
