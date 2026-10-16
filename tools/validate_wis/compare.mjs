// Check src/scripts/wis/earth.js against wis (tools/validate_wis/reference.json, reference.py).
//     node tools/validate_wis/compare.mjs
import { readFileSync } from 'node:fs';
import { stationJ2000 } from '../../src/scripts/wis/earth.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
const codes = Object.fromEntries(JSON.parse(readFileSync(new URL('../../public/data/wis/obscodes.json', import.meta.url))).map((r) => [r[0], r]));
let worst = 0;
for (const [code, rows] of Object.entries(ref.codes)) {
  const [, name, lon, rc, rs] = codes[code];
  const d = rows.map((p, i) => { const q = stationJ2000(ref.utc_ms[i], lon, rc, rs); return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); });
  worst = Math.max(worst, ...d);
  console.log(`${code} ${name.slice(0, 40).padEnd(40)} max ${(1000 * Math.max(...d)).toFixed(0).padStart(4)} m, median ${(1000 * d.sort((a, b) => a - b)[d.length >> 1]).toFixed(0)} m`);
}
console.log(`\nworst difference from wis: ${(1000 * worst).toFixed(0)} m`);

// spacecraft: interpolated exported samples against wis at off-grid times
const { craftJ2000 } = await import('../../src/scripts/wis/craft.js');
const craft = JSON.parse(readFileSync(new URL('../../public/data/wis/spacecraft.json', import.meta.url)));
for (const [code, r] of Object.entries(ref.craft)) {
  const d = r.utc_ms.map((ms, i) => { const q = craftJ2000(craft[code], ms); const p = r.xyz[i]; return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); });
  console.log(`${code} ${craft[code].name.padEnd(28)} interpolation vs wis: max ${(1000 * Math.max(...d)).toFixed(0)} m`);
}
