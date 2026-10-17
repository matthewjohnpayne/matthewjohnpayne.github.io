// Validate src/scripts/planet9/physics.js against the science-notebooks module
// notebooks/planet_nine/p9sec.py. Needs reference.json from reference.py.
//   node tools/validate_planet9/compare.mjs
import { readFileSync } from 'node:fs';
import * as P from '../../src/scripts/planet9/physics.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
let worst = 0;
for (const r of ref.rhs) {
  const js = new P.Secular(r.a, { j2: r.j2 }).rhs(1.0e8, r.y);
  const d = Math.hypot(...js.map((v, k) => v - r.rhs[k])) / Math.hypot(...r.rhs);
  worst = Math.max(worst, d);
}
console.log(`Averaged equations (${ref.rhs.length} states, with and without J2): max relative difference ${worst.toExponential(1)}`);
const T = ref.traj, D = Math.PI / 180;
const sec = new P.Secular(T.a);
const outs = [];
const t0 = performance.now();
P.evolve(sec, P.toVectors(T.e, T.i * D, T.w * D, T.O * D), T.t_end, T.e_out.length, { onOut: (t, y) => outs.push(P.toElements(y)) });
const ms = performance.now() - t0;
let de = 0, di = 0, dv = 0;
outs.forEach((o, k) => {
  de = Math.max(de, Math.abs(o.e - T.e_out[k])); di = Math.max(di, Math.abs(o.i - T.i_out[k]) / D);
  dv = Math.max(dv, Math.abs(((o.varpi - T.varpi_out[k] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / D);
});
console.log(`1 Gyr trajectory (a = 300 au): max |de| ${de.toExponential(1)}, |di| ${di.toFixed(3)} deg, |dvarpi| ${dv.toFixed(3)} deg; ${(ms / 1000).toFixed(1)} s in JS`);
