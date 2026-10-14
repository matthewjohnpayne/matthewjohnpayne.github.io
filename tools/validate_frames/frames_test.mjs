import fs from 'node:fs';
import { integrate } from '../../src/scripts/frames/nbody.js';
import { buildFrames } from '../../src/scripts/frames/frames.js';
const ic = JSON.parse(fs.readFileSync(new URL('../../src/data/frames-ic.json', import.meta.url), 'utf8'));
const out = integrate(ic, { years: 300, dt: 0.5, sampleDays: 2 });
const nk = out.keys.length, N = out.t.length;
const pick = (key) => { const j = out.keys.indexOf(key), xy = new Float64Array(2 * N); for (let k = 0; k < N; k++) { xy[2*k] = out.xyz[(k*nk+j)*3]; xy[2*k+1] = out.xyz[(k*nk+j)*3+1]; } return xy; };
const { frames, meanMotion } = buildFrames({ t: out.t, sun: pick('sun'), planet: pick('earth'), target: pick('kamooalewa') });
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
