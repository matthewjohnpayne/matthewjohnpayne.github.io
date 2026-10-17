// Validate src/scripts/orbitmap/kepler.js against REBOUND two-body positions.
// Needs reference.json from reference.py.
//   node tools/validate_orbit_map/compare.mjs
import { readFileSync } from 'node:fs';
import { decodeBelt, positions, planet } from '../../src/scripts/orbitmap/kepler.js';

const here = new URL('.', import.meta.url);
const root = new URL('../../', import.meta.url);
const ref = JSON.parse(readFileSync(new URL('reference.json', here)));
const meta = JSON.parse(readFileSync(new URL('src/data/orbitmap.json', root)));
const buf = readFileSync(new URL('public/data/orbitmap/belt.bin', root));
const orbits = decodeBelt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta);
const out = new Float32Array(2 * orbits.N);
const KM = 1.495978707e8;

console.log(`Asteroids: ${ref.indices.length} orbits, JS Kepler solver minus REBOUND (two-body)`);
let worst = 0;
for (const t of ref.times) {
  positions(orbits, t, out);
  const d = ref.indices.map((j, k) => Math.hypot(out[2 * j] - ref.asteroids[t.toFixed(1)][k][0], out[2 * j + 1] - ref.asteroids[t.toFixed(1)][k][1]));
  d.sort((x, y) => x - y);
  worst = Math.max(worst, d[d.length - 1]);
  console.log(`  t = ${String(t).padStart(5)} yr: median ${(d[d.length >> 1] * KM).toFixed(0)} km, max ${(d[d.length - 1] * KM).toFixed(0)} km`);
}
const J = planet(meta.planets.jupiter);
console.log('Jupiter, JS minus REBOUND (two-body)');
for (const t of ref.times) {
  const p = J.position(t), r = ref.jupiter[t.toFixed(1)];
  console.log(`  t = ${String(t).padStart(5)} yr: ${(Math.hypot(p[0] - r[0], p[1] - r[1]) * KM).toFixed(0)} km`);
}
console.log('Shape in the frame turning with Jupiter (fraction near the vertices; uniform would be 0.42 and 0.33):');
for (const s of ref.shape) console.log(`  t = ${String(s.t).padStart(5)} yr: Hildas beyond 4.4 au ${s.hildaNearVertices} (of ${s.hildaFar}), Trojans near L4/L5 ${s.trojanNearL4L5}`);
if (ref.quantisation) for (const [t, q] of Object.entries(ref.quantisation)) console.log(`Quantisation at t = ${t} yr: median ${(q.median_au * KM).toFixed(0)} km, max ${(q.max_au * KM).toFixed(0)} km`);
if (worst * KM > 1000) { console.error(`FAIL: worst asteroid difference ${(worst * KM).toFixed(0)} km`); process.exit(1); }
console.log('OK');
