// Orbit figures for the Object of the Month pages, computed when the site is built.
// The object's heliocentric state comes from the MPC Orbits API (tools/export_object_orbits.py);
// it is integrated for one year with the Sun, planets and Moon, using the reference-frames
// page's integrator and initial conditions (src/scripts/frames/nbody.js, src/data/frames-ic.json).
import ic from '../data/frames-ic.json';
import { integrate } from '../scripts/frames/nbody.js';

export interface ObjectData {
  designation: string; fetched: string; epochMJD_TT: number; orbitType: string;
  names: { citation: string; name: string; unpacked_primary_provisional_designation: string };
  kep: Record<string, number>; kepSigma: Record<string, number>;
  com: Record<string, number>; comSigma: Record<string, number>;
  state: number[]; H: number; G: number; periodDays: number;
  arc: string; nobs: number; nopp: number; rms: number; fitDate: string;
}

const DAYS = 365.25, STEP = 0.5, SAMPLE = 1;

export function mjdToDate(mjd: number) {
  return new Date(Date.UTC(1858, 10, 17) + mjd * 86400000);
}

export function orbitFigures(obj: ObjectData) {
  if (obj.epochMJD_TT !== ic.epochMJD_TT) {
    throw new Error(`[objects] ${obj.designation}: orbit epoch MJD ${obj.epochMJD_TT} differs from frames-ic.json (MJD ${ic.epochMJD_TT}); re-run tools/fetch_frames_ic.py`);
  }
  const sun = ic.bodies.find((b) => b.key === 'sun')!.state;
  const particle = { key: 'object', state: obj.state.map((v, i) => v + sun[i]) };
  const run = integrate({ ...ic, particles: [particle] }, { years: DAYS / 365.25, dt: STEP, sampleDays: SAMPLE });
  const keys = run.keys as string[], nk = keys.length, N = run.t.length;
  const at = (key: string, k: number) => { const j = keys.indexOf(key), o = (k * nk + j) * 3; return [run.xyz[o], run.xyz[o + 1], run.xyz[o + 2]]; };

  const helio = { earth: [] as number[][], object: [] as number[][] };
  const corot: number[][] = [];
  let rMin = Infinity, rMax = 0;
  for (let k = 0; k < N; k++) {
    const s = at('sun', k), e = at('earth', k), o = at('object', k);
    const ex = e[0] - s[0], ey = e[1] - s[1], ox = o[0] - s[0], oy = o[1] - s[1];
    helio.earth.push([ex, ey]); helio.object.push([ox, oy]);
    // Frame turning with the Earth: x points away from the Sun through the Earth, y along Earth's motion.
    const th = Math.atan2(ey, ex), c = Math.cos(th), sn = Math.sin(th);
    const dx = ox - ex, dy = oy - ey;
    corot.push([c * dx + sn * dy, -sn * dx + c * dy]);
    const r = Math.hypot(o[0] - e[0], o[1] - e[1], o[2] - e[2]);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  // Earth's Hill radius, a (m / 3 M_sun)^(1/3), with the Moon's mass included.
  const gm = (key: string) => ic.bodies.find((b) => b.key === key)!.gm;
  const aEarth = 1.000001018;   // au, mean semi-major axis of the Earth-Moon barycentre
  const hill = aEarth * Math.cbrt((gm('earth') + gm('moon')) / (3 * gm('sun')));
  return { helio, corot, rMin, rMax, hill, epoch: mjdToDate(obj.epochMJD_TT), days: DAYS };
}
