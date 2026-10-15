// Integrates GJ 876 off the main thread for the Laplace-resonance page.
import { jacobiSetup, advance, jacobiElements, amplitude, GJ876, M_EARTH } from './physics.js';

const DEG = Math.PI / 180;
const wrap = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

self.onmessage = ({ data: { eMass, years } }) => {
  const pl = GJ876.planets.map((p) => ({ m: p.m * M_EARTH * (p.name === 'e' ? eMass : 1), a: p.a, e: p.e,
    inc: GJ876.inc * DEG, Omega: 0, omega: p.omega * DEG, M: p.M * DEG }));
  const { y, m } = jacobiSetup(GJ876.mStar, pl);
  const dt = 0.03, perSample = 20;                    // samples every 0.6 days
  const nS = Math.round((years * 365.25) / (dt * perSample)) + 1;
  const keep = Math.ceil(nS / 3000);
  const ang = { t: [], cb_c: [], cb_b: [], be_b: [], laplace: [] };
  const conj = { cb: [], be: [] };                    // conjunction longitudes relative to b's pericentre
  let prev = null;
  for (let k = 0; k < nS; k++) {
    if (k) advance(y, m, dt, perSample);
    const [, c, b, e] = jacobiElements(y, m);
    const t = (k * perSample * dt) / 365.25;
    const dcb = wrap(c.lambda - b.lambda), dbe = wrap(b.lambda - e.lambda);
    if (prev) {
      // a conjunction is where the faster planet's lead passes up through zero
      if (prev.dcb < 0 && dcb >= 0 && dcb - prev.dcb < Math.PI) conj.cb.push({ t, x: wrap(b.lambda - b.pomega) });
      if (prev.dbe < 0 && dbe >= 0 && dbe - prev.dbe < Math.PI) conj.be.push({ t, x: wrap(b.lambda - b.pomega) });
    }
    prev = { dcb, dbe };
    if (k % keep === 0) {
      ang.t.push(t);
      ang.cb_c.push(wrap(c.lambda - 2 * b.lambda + c.pomega));
      ang.cb_b.push(wrap(c.lambda - 2 * b.lambda + b.pomega));
      ang.be_b.push(wrap(b.lambda - 2 * e.lambda + b.pomega));
      ang.laplace.push(wrap(c.lambda - 3 * b.lambda + 2 * e.lambda));
    }
    if (k % 2000 === 0) self.postMessage({ progress: k / nS });
  }
  const amp = {};
  for (const key of ['cb_c', 'cb_b', 'be_b', 'laplace']) amp[key] = amplitude(ang[key]);
  self.postMessage({ done: true, ang, conj, amp, eMass });
};
