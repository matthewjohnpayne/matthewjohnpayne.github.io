// Validate src/scripts/iso/physics.js against the science-notebooks module
// notebooks/iso_lsst/iso.py. Needs reference.json from reference.py.
//   node tools/validate_iso/compare.mjs
import { readFileSync } from 'node:fs';
import * as P from '../../src/scripts/iso/physics.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
let dState = 0, dPos = 0, dMag = 0, obsDiff = 0, nights = 0, detSame = 0, nDet = 0;
const t0 = performance.now();
for (const o of ref.objects) {
  const { r0, v0 } = P.place(o.vGal, o.b, o.psi);
  for (let k = 0; k < 3; k++) dState = Math.max(dState, Math.abs(r0[k] - o.r0[k]), Math.abs(v0[k] - o.v0[k]) * 1e3);
  const tr = P.track(o.r0, o.v0, o.jd0);
  o.x.forEach((x, i) => { const d = i * 30; dPos = Math.max(dPos, Math.abs(tr.x[d] - x[0]), Math.abs(tr.y[d] - x[1]), Math.abs(tr.z[d] - x[2])); });
  for (let d = 0; d < tr.N; d++) {
    if (o.m[d] < 30) dMag = Math.max(dMag, Math.abs(tr.m[d] - o.m[d]));
    obsDiff += tr.obs[d] !== o.obs[d] ? 1 : 0; nights += 1;
  }
  let pyDet = -1;
  for (let d = 0; d < o.m.length; d++) if (o.obs[d] && o.m[d] <= 24 && o.m[d] > 16) { pyDet = d; break; }
  const jsDet = P.firstDetection(tr);
  if (pyDet >= 0 || jsDet >= 0) { nDet += 1; detSame += pyDet === jsDet ? 1 : 0; }
}
const ms = (performance.now() - t0) / ref.objects.length;
console.log(`${ref.objects.length} objects, ${ms.toFixed(1)} ms per 3-year nightly track`);
console.log(`Starting states (place): max |diff| ${dState.toExponential(1)} (au; au/day x 1000)`);
console.log(`Positions: max |diff| ${dPos.toExponential(1)} au`);
console.log(`Magnitudes (where m < 30): max |diff| ${dMag.toExponential(1)}`);
console.log(`Observable flags differing: ${obsDiff} of ${nights} nights`);
console.log(`First detectable night identical for ${detSame} of ${nDet} detectable objects`);
const a = P.solarApex();
console.log(`Solar apex: ${a.map((v) => v.toFixed(4))} vs ${ref.apex.map((v) => v.toFixed(4))}`);
for (const [k, v] of Object.entries(ref.known)) {
  const j = P.asymptote(P.KNOWN[k]);
  console.log(`${k}: v_inf ${j.vInf.toFixed(4)} vs ${v[0].toFixed(4)}; radiant ${j.radiant.map((x) => x.toFixed(4))} vs ${v[1].toFixed(4)},${v[2].toFixed(4)}`);
}
const { map } = P.radiantMap('G', P.DEFAULT_SOLAR, true, ref.radiant.n_ra, ref.radiant.n_dec, 120);
let dMap = 0;
ref.radiant.map.forEach((row, j) => row.forEach((v, i) => { dMap = Math.max(dMap, Math.abs(map[j * ref.radiant.n_ra + i] - v)); }));
console.log(`Radiant map: max |diff| ${dMap.toExponential(1)} (map normalised to 1)`);
console.log(`Rate factors: ${P.rateFactor(20).toFixed(4)}, ${P.rateFactor(40).toFixed(4)} vs ${ref.rate20.toFixed(4)}, ${ref.rate40.toFixed(4)}`);
