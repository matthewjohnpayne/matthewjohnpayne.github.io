import fs from 'node:fs';
import { integrate } from '../../src/scripts/frames/nbody.js';
import { buildFrames } from '../../src/scripts/frames/frames.js';
const ic = JSON.parse(fs.readFileSync(new URL('../../src/data/frames-ic.json', import.meta.url), 'utf8'));
const out = integrate(ic, { years: 300, dt: 0.5, sampleDays: 2 });
const nk = out.keys.length, N = out.t.length;
const pick = (key) => { const j = out.keys.indexOf(key), xy = new Float64Array(2 * N); for (let k = 0; k < N; k++) { xy[2*k] = out.xyz[(k*nk+j)*3]; xy[2*k+1] = out.xyz[(k*nk+j)*3+1]; } return xy; };
const { frames, meanMotion } = buildFrames({ t: out.t, sun: pick('sun'), planet: pick('earth'), targets: { target: pick('kamooalewa') } });
const P = 2 * Math.PI / meanMotion;
console.log('Earth mean-motion period', P.toFixed(4), 'days (sidereal year 365.2564)');
let maxY = 0; for (let k = 0; k < N; k++) maxY = Math.max(maxY, Math.abs(frames.corotating.planet[2*k+1]));
console.log('co-rotating: max |y| of Earth (should be ~0):', maxY.toExponential(2));
let maxP = 0; for (let k = 0; k < N; k++) maxP = Math.max(maxP, Math.hypot(frames.planetocentric.planet[2*k], frames.planetocentric.planet[2*k+1]));
console.log('planetocentric: max |r| of Earth (should be 0):', maxP);
// Winding of Earth->Kamo'oalewa direction over 10 years, non-rotating vs co-rotating
const winding = (fr, years) => { const n = Math.round(years * 365.25 / 2); let tot = 0, prev = null;
  for (let k = 0; k <= n; k++) { const dx = fr.target[2*k] - fr.planet[2*k], dy = fr.target[2*k+1] - fr.planet[2*k+1]; const a = Math.atan2(dy, dx);
    if (prev !== null) { let d = a - prev; if (d > Math.PI) d -= 2*Math.PI; if (d < -Math.PI) d += 2*Math.PI; tot += d; } prev = a; } return tot / (2*Math.PI); };
console.log('winding over 10 yr, non-rotating:', winding(frames.planetocentric, 10).toFixed(2), ' co-rotating:', winding(frames.corotating, 10).toFixed(2));
let jx=0,jy=0,ex=0; for (let k=0;k<N;k++){ jx=Math.max(jx,Math.abs(frames.synodic.planet[2*k]-1)); jy=Math.max(jy,Math.abs(frames.synodic.planet[2*k+1])); }
console.log('synodic: Earth epicycle half-extent radial', jx.toFixed(4), 'along-track', jy.toFixed(4), '(expect ~a·e=0.0167, 2a·e=0.033)');

// Jupiter: Hektor (Trojan, L4) and Hilda (3:2)
const J = buildFrames({ t: out.t, sun: pick('sun'), planet: pick('jupiter'), targets: { hektor: pick('hektor'), hilda: pick('hilda') } });
console.log('Jupiter mean-motion period', (2 * Math.PI / J.meanMotion / 365.25).toFixed(3), 'yr (expect 11.86)');
const deg = (x, y) => Math.atan2(y, x) * 180 / Math.PI;
let lo = 999, hi = -999, sum = 0;
for (let k = 0; k < N; k++) { const d = deg(J.frames.corotating.hektor[2*k], J.frames.corotating.hektor[2*k+1]); lo = Math.min(lo, d); hi = Math.max(hi, d); sum += d; }
console.log(`Hektor longitude ahead of Jupiter: mean ${(sum / N).toFixed(1)}°, range ${lo.toFixed(1)}° to ${hi.toFixed(1)}° (expect libration about +60°)`);
const revs = (xy) => { let tot = 0; for (let k = 1; k < N; k++) { let d = Math.atan2(xy[2*k+1], xy[2*k]) - Math.atan2(xy[2*k-1], xy[2*k-2]); if (d > Math.PI) d -= 2*Math.PI; if (d < -Math.PI) d += 2*Math.PI; tot += d; } return tot / (2 * Math.PI); };
console.log('Hilda : Jupiter heliocentric revolutions over 300 yr', (revs(J.frames.heliocentric.hilda) / revs(J.frames.heliocentric.planet)).toFixed(4), '(expect ~1.5)');
// Hilda aphelia in the co-rotating frame should cluster near L4 (+60°), L3 (180°), L5 (−60°)
const r = (k) => Math.hypot(J.frames.heliocentric.hilda[2*k], J.frames.heliocentric.hilda[2*k+1]);
const bins = { L4: 0, L3: 0, L5: 0, other: 0 };
for (let k = 1; k < N - 1; k++) if (r(k) > r(k-1) && r(k) >= r(k+1)) {
  const d = deg(J.frames.corotating.hilda[2*k], J.frames.corotating.hilda[2*k+1]);
  if (Math.abs(d - 60) < 30) bins.L4++; else if (Math.abs(Math.abs(d) - 180) < 30) bins.L3++; else if (Math.abs(d + 60) < 30) bins.L5++; else bins.other++;
}
console.log('Hilda aphelia within 30° of each point:', JSON.stringify(bins));
