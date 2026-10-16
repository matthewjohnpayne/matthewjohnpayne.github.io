// Validate src/scripts/exomoons/physics.js against the science-notebooks module
// notebooks/exomoons_wd/exomoons.py (REBOUND, IAS15). Needs reference.json from reference.py.
//   node tools/validate_exomoons/compare.mjs
import { readFileSync } from 'node:fs';
import * as P from '../../src/scripts/exomoons/physics.js';

const ref = JSON.parse(readFileSync(new URL('reference.json', import.meta.url)));
for (const [name, c] of Object.entries(ref)) {
  const fl = P.FLYBYS[name];
  const t0 = performance.now();
  const st = P.flybyStart(fl);
  let dStart = 0;
  c.start.forEach((s, i) => s.forEach((v, k) => { dStart = Math.max(dStart, Math.abs(st.y[6 * i + k] - v) / (k < 3 ? 1 : 1e-3)); }));
  let same = 0, dA = 0, dE = 0, nb = 0, steps = 0, unresolved = 0;
  c.moons.forEach((m, i) => {
    const r = P.runMoon(st, { a: m.a, e: m.e, inc: m.inc, Om: m.Omega, om: m.omega, M: m.M }, fl.tSim, fl.mp);
    const py = c.results[i];
    steps += r.steps;
    if (r.unresolved) { unresolved += 1; return; }
    if (r.bound === py.bound && r.captured === py.captured) same += 1;
    if (r.bound && py.bound) { nb += 1; dA = Math.max(dA, Math.abs(r.aFinal / py.a - 1)); dE = Math.max(dE, Math.abs(r.eFinal - py.e)); }
  });
  const ms = (performance.now() - t0) / c.moons.length;
  console.log(`${name}: start state max |diff| ${dStart.toExponential(1)} (au; au/day x 1000); same fate for ${same}/${c.moons.length - unresolved} moons (${unresolved} unresolved: over the step limit); `
    + `bound in both: ${nb}, final a within ${(100 * dA).toFixed(3)}%, e within ${dE.toExponential(1)}; ${ms.toFixed(0)} ms and ${(steps / c.moons.length).toFixed(0)} steps per moon`);
}
