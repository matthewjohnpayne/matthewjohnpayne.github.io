// Validate src/scripts/heliolinc/linking.js against the science-notebooks
// HelioLinC module. Needs reference.json from reference.py.
//   node tools/validate_heliolinc/compare.mjs
import { readFileSync } from 'node:fs';
import * as hl from '../../src/scripts/heliolinc/linking.js';

const here = new URL('.', import.meta.url);
const root = new URL('../../', import.meta.url);
const ref = JSON.parse(readFileSync(new URL('reference.json', here)));
const meta = JSON.parse(readFileSync(new URL('src/data/heliolinc.json', root)));
const buf = readFileSync(new URL('public/data/heliolinc/field.bin', root));
const { det, obj, night } = hl.decodeField(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta);
const T_C = meta.windowCentreJD;

console.log('Earth position (au), JS minus Python');
for (const e of ref.earth) {
  const js = hl.earthPosition(e.jd);
  console.log(`  JD ${e.jd}: max |diff| ${Math.max(...js.map((v, k) => Math.abs(v - e.pos[k]))).toExponential(1)}`);
}
const p = hl.prepare(det, T_C, 0.4);
console.log(`Reference frame: max |diff| ${Math.max(...p.frame.flatMap((row, i) => row.map((v, k) => Math.abs(v - ref.frame[i][k])))).toExponential(1)}`);
for (const gd of [0, 2e-3]) {
  const a = hl.fitArrows(p, gd);
  const r = ref[`arrows_${gd === 0 ? '0.0' : gd}`];
  let mp = 0, mr = 0;
  r.forEach((row, j) => {
    mp = Math.max(mp, Math.abs(a[4 * j] - row[0]), Math.abs(a[4 * j + 1] - row[1]));
    mr = Math.max(mr, Math.abs(a[4 * j + 2] - row[2]), Math.abs(a[4 * j + 3] - row[3]));
  });
  console.log(`Arrows, gamma_dot = ${gd}: first ${r.length} tracklets, max |diff| position ${mp.toExponential(1)} rad, rate ${mr.toExponential(1)} rad/day`);
}
const pc = hl.prepare({ jd: Float64Array.from(meta.crocco.t, (t) => t + meta.crocco.windowCentreJD), ra: Float64Array.from(meta.crocco.ra),
  dec: Float64Array.from(meta.crocco.dec), tracklet: Int32Array.from(meta.crocco.t, (_, i) => Math.floor(i / 3)) }, meta.crocco.windowCentreJD, 0.4);
const ac = hl.fitArrows(pc, 0);
console.log(`Crocco arrows: max |diff| ${Math.max(...ref.crocco_arrows.flatMap((row, j) => row.map((v, k) => Math.abs(v - ac[4 * j + k])))).toExponential(1)}`);
console.log(`Findable objects: JS ${hl.findable(obj, night)}, Python ${ref.findable}`);
console.log('Linking scores, JS vs Python (pure objects, valid objects, erroneous clusters, clusters)');
let same = 0;
for (const s of ref.scores) {
  const t0 = performance.now();
  const cl = hl.link(det, T_C, { gammas: s.gammas || [0.4], gammaDots: meta.notebook.gammaDots, d: s.d, dt: s.dt, zDir: s.gammas ? p.frame[2] : null });
  const js = hl.score(cl, obj);
  const ok = js.pureObjects === s.pure_objects && js.validObjects === s.valid_objects && js.erroneous === s.erroneous && js.clusters === s.clusters;
  same += ok;
  console.log(`  d ${s.d}, dt ${s.dt}${s.gammas ? ', four gammas' : ''}: JS ${js.pureObjects} ${js.validObjects} ${js.erroneous} ${js.clusters} | Python ${s.pure_objects} ${s.valid_objects} ${s.erroneous} ${s.clusters} ${ok ? 'same' : 'DIFFERENT'} (${((performance.now() - t0) / 1000).toFixed(2)} s)`);
}
console.log(`${same} of ${ref.scores.length} identical`);
const nb = meta.notebook.scan['5.0'][meta.notebook.dGrid.findIndex((d) => Math.abs(d - 1e-3) < 1e-12)];
console.log(`Notebook (float64 data), d 0.001, dt 5: ${nb.pure_objects} ${nb.valid_objects} ${nb.erroneous} ${nb.clusters}`);
