import fs from 'node:fs';
import { integrate } from '../../src/scripts/frames/nbody.js';
const [icPath, refPath, dtArg] = process.argv.slice(2);
const ic = JSON.parse(fs.readFileSync(icPath, 'utf8'));
const dt = Number(dtArg);
const t0 = performance.now();
const out = integrate(ic, { years: 300, dt, sampleDays: 2 });
const ms = performance.now() - t0;
const ref = new Float64Array(fs.readFileSync(refPath).buffer.slice(0));
const nk = out.keys.length, N = out.t.length;
const idx = (k) => out.keys.indexOf(k);
const err = (key, rel) => {
  const j = idx(key), r = rel ? idx(rel) : -1; let worst = 0, at = 0; const marks = {};
  for (let s = 0; s < N; s++) {
    let d2 = 0;
    for (let c = 0; c < 3; c++) {
      const o = (s * nk + j) * 3 + c, ro = r >= 0 ? (s * nk + r) * 3 + c : -1;
      const a = out.xyz[o] - (r >= 0 ? out.xyz[ro] : 0), b = ref[o] - (r >= 0 ? ref[ro] : 0);
      d2 += (a - b) ** 2;
    }
    const d = Math.sqrt(d2); if (d > worst) { worst = d; at = out.t[s] / 365.25; }
    for (const y of [10, 50, 100, 200, 300]) if (Math.abs(out.t[s] / 365.25 - y) < 0.003) marks[y] = d;
  }
  return `${key}${rel ? '-' + rel : ''}: max ${worst.toExponential(2)} AU (yr ${at.toFixed(0)}); ` + Object.entries(marks).map(([y, d]) => `${y}y ${d.toExponential(1)}`).join(', ');
};
console.log(`dt=${dt} d, ${N} samples, ${ms.toFixed(0)} ms`);
console.log(err('earth', 'sun')); console.log(err('kamooalewa', 'sun')); console.log(err('kamooalewa', 'earth')); console.log(err('moon','earth'));
