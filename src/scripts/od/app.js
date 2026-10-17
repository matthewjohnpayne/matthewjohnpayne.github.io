// Interactive orbit-determination page, using the first six weeks of
// astrometry of 2024 YR4: (1) one observation is a direction; (2) one night's
// tracklet allows a whole family of orbits, the admissible region; (3) where
// that family puts the object on a later night; (4) Gauss's method from three
// nights; (5) least squares on more and more nights. Nothing moves on its own;
// the slower computations run on request in a worker.
import * as od from './od.js';
import { COLORS, fit, frame, dot, fmt, sig, logLabel } from '../plotting.js';

const DEG = Math.PI / 180, LD_KM = 384400;
const C = { ...COLORS, neo: '#d9822b', inner: '#078d97', outer: '#3f6f8f', earthBound: '#9a6fb0', none: '#eef3f4',
  jpl: '#078d97', guess: '#d9822b', earth: '#3f6f8f', ra: '#078d97', dec: '#b5651d' };
// distance colours for the family of predictions (viridis)
const VIR = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const RHO_MIN = 1e-3, RHO_MAX = 2, KMS_MAX = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ARCS = [2, 3, 4, 6, 8, 11, 15, 22, 29, 46];        // days of observations used in section 5

/** Calendar date (UTC, roughly: TDB less 69 s) of a Julian date. */
function calendar(jd, withTime = false) {
  // dates alone are of the TDB day (so that 2025 May 1.0 TDB reads as May 1)
  const ms = Math.round((jd - 2440587.5 - (withTime ? 69.184 / 86400 : 0)) * 1440) * 60000, d = new Date(ms);
  const s = `${d.getUTCFullYear()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return withTime ? `${s}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` : s;
}
const lerpColour = (stops, f) => {
  f = Math.max(0, Math.min(1, f)) * (stops.length - 1);
  const i = Math.min(Math.floor(f), stops.length - 2), t = f - i;
  const a = stops[i].match(/\w\w/g).map((h) => parseInt(h, 16)), b = stops[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${a.map((v, k) => Math.round(v + t * (b[k] - v))).join(',')})`;
};
const kmFmt = (au) => {
  const km = au * od.KM_PER_AU;
  return km < 1e6 ? `${fmt(Math.round(km / 1000) * 1000)} km` : `${sig(km / 1e6)} million km`;
};
const angleFmt = (as) => (as < 60 ? `${sig(as)}″` : as < 3600 ? `${sig(as / 60)}′` : `${sig(as / 3600)}°`);

function classify(el) {
  if (!(el.e < 1)) return { key: 'none', label: 'not bound to the Sun' };
  if (el.q < 1.3) return { key: 'neo', label: 'near-Earth asteroid (q < 1.3 au)' };
  if (el.a < 5.2) return { key: 'inner', label: 'inside Jupiter’s orbit, not near-Earth' };
  return { key: 'outer', label: 'beyond Jupiter (a > 5.2 au)' };
}

export function startOD(base) {
  const $ = (id) => document.getElementById(id);
  const statusAll = $('od-load-status');
  let m = null, worker = null, nextId = 0;
  const pending = new Map();
  const call = (type, payload) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });

  fetch(`${base}data/od/yr4.json`).then((r) => r.json()).then((data) => {
    m = od.load(data);
    m.sites = data.sites;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      ev.data.error ? p.reject(new Error(ev.data.error)) : p.resolve(ev.data.result);
    };
    return call('init', data);
  }).then(() => {
    if (statusAll) statusAll.textContent = '';
    setup();
  }).catch((e) => {
    if (statusAll) statusAll.textContent = `The observations could not be loaded (${e.message}).`;
  });

  function setup() {
    const disc = m.tracklets.findIndex((tk) => tk.some((k) => m.obs[k].disc));
    const dks = m.tracklets[disc];
    const att = od.attributable(m, dks), site = od.siteAt(m, dks, att.t);
    const jplTraj = od.propagate(m, m.jpl.epoch_state, m.epoch, m.obs[0].t - 0.02, m.predict + 0.02);
    const sunAt = (t) => od.sunState(m, t);
    const helio = (x, t) => { const s = sunAt(t); return x.map((v, k) => v - s[k]); };
    const trueX = jplTraj.at(att.t);
    const rel = [0, 1, 2].map((k) => trueX[k] - site[k]), relv = [0, 1, 2].map((k) => trueX[k + 3] - site[k + 3]);
    const trueRho = Math.hypot(...rel), trueRhod = (rel[0] * relv[0] + rel[1] * relv[1] + rel[2] * relv[2]) / trueRho;
    const trackletLabel = (i) => {
      const tk = m.tracklets[i], o = m.obs[tk[0]];
      return `${calendar(o.t, true)} · ${m.sites[o.stn] || o.stn} (${o.stn}) · ${tk.length} obs`;
    };
    const mag = dks.map((k) => m.obs[k].mag).filter((v) => v != null);
    const meanMag = mag.reduce((a, b) => a + b, 0) / mag.length;

    // shared state: the reader's guess
    const state = { rho: 0.04, rhod: 0, reveal: false };
    const guessX = () => od.stateFrom(att, site, state.rho, state.rhod);

    // ======================== 1. A direction ======================================
    const s1 = { canvas: $('od-los'), dist: $('od-dist'), distOut: $('od-dist-out'), view: document.getElementsByName('od-los-view'),
      km: $('od-r-km'), size: $('od-r-size'), rate: $('od-r-rate') };
    $('od-disc-summary').textContent = `${dks.length} positions over ${Math.round((m.obs[dks[dks.length - 1]].t - m.obs[dks[0]].t) * 1440)} minutes, ${calendar(m.obs[dks[0]].t, true)}`;
    const rateDeg = Math.hypot(att.rad * Math.cos(att.dec), att.decd) / DEG;
    s1.rate.textContent = `${sig(rateDeg)}° per day`;

    /** Rough diameter (m) for the reported magnitude at distance rho: H from the IAU H, G system (G = 0.15). */
    function diameter(rho, albedo) {
      const x = od.stateFrom(att, site, rho, 0), s = sunAt(att.t);
      const r = Math.hypot(x[0] - s[0], x[1] - s[1], x[2] - s[2]);
      const toSun = [s[0] - x[0], s[1] - x[1], s[2] - x[2]], toObs = [site[0] - x[0], site[1] - x[1], site[2] - x[2]];
      const cosA = (toSun[0] * toObs[0] + toSun[1] * toObs[1] + toSun[2] * toObs[2]) / (r * rho);
      const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const t = Math.tan(alpha / 2);
      const phi1 = Math.exp(-3.33 * t ** 0.63), phi2 = Math.exp(-1.87 * t ** 1.22);
      const H = meanMag - 5 * Math.log10(r * rho) + 2.5 * Math.log10(0.85 * phi1 + 0.15 * phi2);
      return 1329e3 / Math.sqrt(albedo) * 10 ** (-H / 5);
    }
    const sizeFmt = (mtr) => (mtr < 1000 ? `${sig(mtr)} m` : `${sig(mtr / 1000)} km`);

    function drawLOS() {
      const { ctx, w, h } = fit(s1.canvas);
      const near = [...s1.view].find((r) => r.checked)?.value !== 'inner';
      const earth = [0, 0, 0], moon = [0, 0, 0];
      od.bodyState(m, 3, att.t, earth); od.bodyState(m, 4, att.t, moon);
      const s = sunAt(att.t);
      const centre = near ? od.eclipticXY(earth) : od.eclipticXY(s);
      const span = near ? 0.06 : 1.8;
      const sc = Math.min(w, h) / (2 * span);
      const P = (xy) => [w / 2 + (xy[0] - centre[0]) * sc, h / 2 - (xy[1] - centre[1]) * sc];
      ctx.font = '12px system-ui, sans-serif';
      // Sun and the Earth's orbit (from its state), or the Moon's orbit
      const eh = helio([...earth, 0, 0, 0], att.t);
      const ev = [0, 0, 0]; od.bodyState(m, 3, att.t, [0, 0, 0], ev);
      const sv = s.slice(3);
      const earthOrbit = od.orbitPath([eh[0], eh[1], eh[2], ev[0] - sv[0], ev[1] - sv[1], ev[2] - sv[2]], m.gm[0] + m.gm[3] + m.gm[4]);
      const sxy = od.eclipticXY(s);
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.beginPath();
      earthOrbit.forEach(([x, y], i) => { const p = P([x + sxy[0], y + sxy[1]]); i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
      ctx.stroke();
      if (near) {
        const md = Math.hypot(moon[0] - earth[0], moon[1] - earth[1], moon[2] - earth[2]);
        ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(...P(od.eclipticXY(earth)), md * sc, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
        dot(ctx, ...P(od.eclipticXY(moon)), 3, '#8a9ba6');
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText('Moon', P(od.eclipticXY(moon))[0] + 6, P(od.eclipticXY(moon))[1]);
        // direction to the Sun
        const d = [sxy[0] - centre[0], sxy[1] - centre[1]], dn = Math.hypot(...d);
        const a0 = P([centre[0] + d[0] / dn * span * 0.78, centre[1] + d[1] / dn * span * 0.78]);
        const a1 = P([centre[0] + d[0] / dn * span * 0.95, centre[1] + d[1] / dn * span * 0.95]);
        ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...a1); ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.fillText('to the Sun', a0[0], a0[1] + (a0[1] > h / 2 ? 14 : -8));
      } else {
        dot(ctx, ...P(sxy), 6, '#e9a160');
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText('Sun', P(sxy)[0] + 9, P(sxy)[1] + 4);
      }
      // line of sight, out to the edge of the view
      const L = od.unit(att.ra, att.dec), sxy0 = od.eclipticXY(site), Lxy = od.eclipticXY(L);
      const far = near ? 0.2 : 4;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); ctx.beginPath();
      ctx.moveTo(...P(sxy0)); ctx.lineTo(...P([sxy0[0] + far * Lxy[0], sxy0[1] + far * Lxy[1]])); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx, ...P(od.eclipticXY(earth)), near ? 6 : 4, C.earth);
      ctx.fillStyle = C.earth; ctx.textAlign = 'left'; ctx.fillText('Earth', P(od.eclipticXY(earth))[0] + 8, P(od.eclipticXY(earth))[1] - 6);
      const g = od.eclipticXY(od.stateFrom(att, site, state.rho, 0));
      dot(ctx, ...P(g), 6, C.guess);
      if (state.reveal) {
        const t = od.eclipticXY(trueX);
        ctx.strokeStyle = C.jpl; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(...P(t), 8, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.fillStyle = C.text; ctx.textAlign = 'left';
      ctx.fillText(near ? 'Near the Earth (seen from ecliptic north; 0.06 au ≈ 9 million km)' : 'Inner Solar System (seen from ecliptic north)', 10, h - 10);
      s1.canvas.setAttribute('aria-label', `Top-down view ${near ? 'near the Earth' : 'of the inner Solar System'}: the line of sight from the Earth towards 2024 YR4 at discovery, with the guessed position ${kmFmt(state.rho)} away.`);
    }
    function showDistance() {
      s1.distOut.textContent = `${kmFmt(state.rho)} (${sig(state.rho)} au)`;
      s1.km.textContent = state.rho * od.KM_PER_AU < 3e7 ? `${sig(state.rho * od.KM_PER_AU / LD_KM)} times the Moon’s distance` : `${sig(state.rho)} au`;
      s1.size.textContent = `${sizeFmt(diameter(state.rho, 0.25))} to ${sizeFmt(diameter(state.rho, 0.05))}`;
    }
    s1.dist.addEventListener('input', () => { state.rho = 10 ** Number(s1.dist.value); syncAll(); });
    [...s1.view].forEach((r) => r.addEventListener('change', drawLOS));

    // ======================== 2. The admissible region ============================
    // beyond this distance no orbit matching the tracklet's motion is bound to the Sun
    let rhoBound = RHO_MIN;
    for (let lr = Math.log10(RHO_MIN); lr <= Math.log10(RHO_MAX); lr += 0.002) if (od.rhodotLimits(m, att, site, 10 ** lr)) rhoBound = 10 ** lr;
    $('od-maxrho').textContent = `${sig(rhoBound)} au (${kmFmt(rhoBound)})`;
    const s2 = { region: $('od-region'), orbit: $('od-orbit'), rhod: $('od-rhod'), rhodOut: $('od-rhod-out'), dist: $('od-dist2'),
      distOut: $('od-dist2-out'), cls: $('od-r-class'), a: $('od-r-a'), e: $('od-r-e'), i: $('od-r-i'), q: $('od-r-q'),
      reveal: $('od-reveal'), revealText: $('od-reveal-text') };
    let regionImage = null, regionKey = '';
    const regionFrame = (ctx, w, h) => frame(ctx, w, h, { x0: RHO_MIN, x1: RHO_MAX, y0: -KMS_MAX, y1: KMS_MAX, xlog: true,
      xlabel: 'Guessed distance from the observer (au)', ylabel: 'Guessed speed away from us (km/s)', xfmt: logLabel, left: 56 });
    function drawRegion() {
      const { ctx, w, h } = fit(s2.region);
      const F = regionFrame(ctx, w, h);
      const key = `${w}x${h}`;
      if (key !== regionKey) {
        // colour each cell by the kind of orbit it implies
        const img = ctx.createImageData(Math.ceil(F.pw), Math.ceil(F.ph));
        const cols = Math.ceil(F.pw / 3), rows = Math.ceil(F.ph / 3);
        const rgb = (hex) => hex.match(/\w\w/g).map((x) => parseInt(x, 16));
        const pal = { neo: rgb(C.neo), inner: rgb(C.inner), outer: rgb(C.outer), earthBound: rgb(C.earthBound) };
        for (let ci = 0; ci < cols; ci++) {
          const rho = 10 ** (Math.log10(RHO_MIN) + (ci + 0.5) / cols * (Math.log10(RHO_MAX) - Math.log10(RHO_MIN)));
          const lim = od.rhodotLimits(m, att, site, rho);
          if (!lim) continue;
          for (let ri = 0; ri < rows; ri++) {
            const kms = KMS_MAX - (ri + 0.5) / rows * 2 * KMS_MAX, rd = kms / od.KMS_PER_AUD;
            if (rd < lim[0] || rd > lim[1]) continue;
            const x = od.stateFrom(att, site, rho, rd);
            const k = od.earthBound(m, x, att.t) ? 'earthBound' : classify(od.elements(helio(x, att.t), m.gm[0])).key;
            const c = pal[k];
            for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
              const px = ci * 3 + dx, py = ri * 3 + dy;
              if (px >= img.width || py >= img.height) continue;
              const o = 4 * (py * img.width + px);
              img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 120;
            }
          }
        }
        regionImage = img; regionKey = key;
      }
      // putImageData ignores the transform, so draw through an offscreen canvas
      const off = document.createElement('canvas');
      off.width = regionImage.width; off.height = regionImage.height;
      off.getContext('2d').putImageData(regionImage, 0, 0);
      ctx.drawImage(off, F.L, F.T, F.pw, F.ph);
      regionFrame(ctx, w, h);
      // the reader's guess and, if revealed, the answer
      const gx = F.X(state.rho), gy = F.Y(state.rhod * od.KMS_PER_AUD);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(gx, gy, 6, 0, 2 * Math.PI); ctx.stroke();
      dot(ctx, gx, gy, 3, C.ink);
      if (state.reveal) {
        const tx = F.X(trueRho), ty = F.Y(trueRhod * od.KMS_PER_AUD);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx - 7, ty); ctx.lineTo(tx + 7, ty); ctx.moveTo(tx, ty - 7); ctx.lineTo(tx, ty + 7); ctx.stroke();
        ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.stroke();
      }
      s2.region.setAttribute('aria-label', `The admissible region for the discovery tracklet: distances from 0.001 to 100 au against speeds away from the observer. Your guess: ${sig(state.rho)} au, ${sig(state.rhod * od.KMS_PER_AUD)} km/s.${state.reveal ? ` JPL's orbit: ${sig(trueRho)} au, ${sig(trueRhod * od.KMS_PER_AUD)} km/s.` : ''}`);
    }
    function pickRegion(ev) {
      const r = s2.region.getBoundingClientRect(), w = r.width, h = r.height;
      const L = 56, R = 12, T = 12, B = 38, pw = w - L - R, ph = h - T - B;
      const fx = (ev.clientX - r.left - L) / pw, fy = (ev.clientY - r.top - T) / ph;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      state.rho = 10 ** (Math.log10(RHO_MIN) + fx * (Math.log10(RHO_MAX) - Math.log10(RHO_MIN)));
      state.rhod = (KMS_MAX - fy * 2 * KMS_MAX) / od.KMS_PER_AUD;
      syncAll();
    }
    s2.region.addEventListener('click', pickRegion);
    s2.region.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 5 : 1;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') state.rho = Math.min(RHO_MAX, Math.max(RHO_MIN, state.rho * 10 ** ((ev.key === 'ArrowRight' ? 1 : -1) * 0.02 * step)));
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') state.rhod = Math.min(KMS_MAX, Math.max(-KMS_MAX, state.rhod * od.KMS_PER_AUD + (ev.key === 'ArrowUp' ? 0.5 : -0.5) * step)) / od.KMS_PER_AUD;
      else return;
      ev.preventDefault();
      syncAll();
    });
    function drawOrbit(canvas, orbits, t, label) {
      const { ctx, w, h } = fit(canvas);
      const span = 3.4, sc = Math.min(w, h) / (2 * span);
      const P = ([x, y]) => [w / 2 + x * sc, h / 2 - y * sc];
      const s = sunAt(t);
      // planets: orbits from their own states at time t
      [[3, 'Earth', C.earth], [5, 'Mars', '#b5654a'], [6, 'Jupiter', '#8a9ba6']].forEach(([b, name, col]) => {
        const p = [0, 0, 0], v = [0, 0, 0];
        od.bodyState(m, b, t, p, v);
        const xh = [p[0] - s[0], p[1] - s[1], p[2] - s[2], v[0] - s[3], v[1] - s[4], v[2] - s[5]];
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.beginPath();
        od.orbitPath(xh, m.gm[0]).forEach((q, i) => (i ? ctx.lineTo(...P(q)) : ctx.moveTo(...P(q))));
        ctx.stroke();
        const pp = P(od.eclipticXY(xh));
        if (pp[0] > 0 && pp[0] < w && pp[1] > 0 && pp[1] < h) {
          dot(ctx, ...pp, 3.5, col);
          ctx.fillStyle = col; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(name, pp[0] + 6, pp[1] - 4);
        }
      });
      dot(ctx, ...P([0, 0]), 5, '#e9a160');
      for (const o of orbits) {
        ctx.strokeStyle = o.colour; ctx.lineWidth = o.width || 2; ctx.setLineDash(o.dash || []); ctx.beginPath();
        od.orbitPath(o.xh, m.gm[0], 400).forEach((q, i) => (i ? ctx.lineTo(...P(q)) : ctx.moveTo(...P(q))));
        ctx.stroke(); ctx.setLineDash([]);
        dot(ctx, ...P(od.eclipticXY(o.xh)), 4, o.colour);
      }
      ctx.fillStyle = C.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(label, 10, h - 10);
      ctx.textAlign = 'right'; ctx.fillText('1 au', w - 12, 18);
      ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(w - 12 - sc, 24); ctx.lineTo(w - 12, 24); ctx.stroke();
    }
    function drawGuessOrbit() {
      const xh = helio(guessX(), att.t);
      const orbits = [{ xh, colour: C.guess }];
      if (state.reveal) orbits.push({ xh: helio(trueX, att.t), colour: C.jpl, dash: [6, 4] });
      drawOrbit(s2.orbit, orbits, att.t, 'Seen from ecliptic north, at discovery');
      const el = od.elements(xh, m.gm[0]), cl = od.earthBound(m, guessX(), att.t) ? { label: 'orbiting the Earth' } : classify(el);
      s2.cls.textContent = cl.label;
      const bound = el.e < 1;
      s2.a.textContent = bound ? `${sig(el.a)} au` : '–';
      s2.e.textContent = sig(el.e);
      s2.i.textContent = `${sig(el.i)}°`;
      s2.q.textContent = `${sig(el.q)} au`;
      s2.orbit.setAttribute('aria-label', `The orbit implied by your guess: ${cl.label}; eccentricity ${sig(el.e)}, perihelion ${sig(el.q)} au.`);
    }
    s2.rhod.addEventListener('input', () => { state.rhod = Number(s2.rhod.value) / od.KMS_PER_AUD; syncAll(); });
    s2.dist.addEventListener('input', () => { state.rho = 10 ** Number(s2.dist.value); syncAll(); });
    s2.reveal.addEventListener('click', () => {
      state.reveal = !state.reveal;
      s2.reveal.setAttribute('aria-pressed', String(state.reveal));
      s2.reveal.textContent = state.reveal ? 'Hide JPL’s answer' : 'Show JPL’s answer';
      const el = od.elements(helio(trueX, att.t), m.gm[0]);
      s2.revealText.textContent = state.reveal
        ? `JPL’s orbit, from years of observations, puts 2024 YR4 ${kmFmt(trueRho)} away at discovery (${sig(trueRho * od.KM_PER_AU / LD_KM)} lunar distances), moving away at ${sig(trueRhod * od.KMS_PER_AUD)} km/s: a near-Earth asteroid with a = ${sig(el.a)} au, e = ${sig(el.e)}, i = ${sig(el.i)}°.`
        : '';
      syncAll();
    });

    function syncAll() {
      state.rho = Math.min(RHO_MAX, Math.max(RHO_MIN, state.rho));
      s1.dist.value = Math.log10(state.rho); s2.dist.value = Math.log10(state.rho);
      s2.rhod.value = state.rhod * od.KMS_PER_AUD;
      s2.distOut.textContent = `${sig(state.rho)} au`;
      s2.rhodOut.textContent = `${sig(state.rhod * od.KMS_PER_AUD)} km/s`;
      showDistance(); drawLOS(); drawRegion(); drawGuessOrbit();
      drawBanana();
    }

    // ======================== 3. The next night ===================================
    const s3 = { canvas: $('od-banana'), target: $('od-target'), run: $('od-banana-run'), status: $('od-banana-status'), zoom: $('od-banana-zoom'),
      key: $('od-banana-key') };
    // later tracklets from other nights, chosen to show the family spreading out
    const later = [];
    for (const days of [0.6, 1, 2, 4, 8]) {
      const i = m.tracklets.findIndex((tk) => m.obs[tk[0]].t > att.t + days - 0.25);
      if (i >= 0 && !later.includes(i)) later.push(i);
    }
    later.forEach((i) => {
      const o = m.obs[m.tracklets[i][0]];
      const opt = document.createElement('option');
      opt.value = i;
      const dt = o.t - att.t;
      opt.textContent = `${dt < 1 ? `${Math.round(dt * 24)} hours` : `${Math.round(dt)} day${Math.round(dt) > 1 ? 's' : ''}`} later: ${calendar(o.t)}, ${m.sites[o.stn] || o.stn}`;
      s3.target.append(opt);
    });
    let family = null, familyBusy = false, zoomChosen = false;
    // orbits spread evenly in log distance and in range rate across the bound region
    const FAM_LO = 0.002;
    function familySamples() {
      const out = [];
      let seed = 7;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      while (out.length < 1200) {
        const rho = 10 ** (Math.log10(FAM_LO) + rand() * (Math.log10(rhoBound) - Math.log10(FAM_LO)));
        const lim = od.rhodotLimits(m, att, site, rho);
        if (!lim) continue;
        const rd = lim[0] + rand() * (lim[1] - lim[0]);
        if (!od.earthBound(m, od.stateFrom(att, site, rho, rd), att.t)) out.push([rho, rd]);
      }
      return out;
    }
    async function runFamily() {
      if (familyBusy) return;
      familyBusy = true; s3.run.disabled = true;
      s3.status.textContent = 'Integrating the family of orbits…';
      const target = m.tracklets[Number(s3.target.value)][0];
      const samples = familySamples();
      samples.push([state.rho, state.rhod]);
      const t0 = performance.now();
      try {
        const { out } = await call('banana', { tracklet: disc, target, samples });
        family = { target, samples, out };
        if (!zoomChosen) {
          // the smallest view that holds at least half of the predictions
          const opts = [...s3.zoom.options].map((o) => Number(o.value));
          const fits = (z) => { let k = 0; for (let i = 0; i < samples.length - 1; i++) if (Math.abs(out[2 * i]) < z * 3600 && Math.abs(out[2 * i + 1]) < z * 1800) k++; return k >= samples.length / 2; };
          s3.zoom.value = String(opts.find(fits) ?? opts[opts.length - 1]);
        }
        s3.status.textContent = `${fmt(samples.length - 1)} orbits integrated in ${sig((performance.now() - t0) / 1000)} s.`;
      } catch (e) {
        s3.status.textContent = `Failed: ${e.message}`;
      }
      familyBusy = false; s3.run.disabled = false;
      drawBanana();
    }
    s3.run.addEventListener('click', runFamily);
    s3.target.addEventListener('change', () => { family = null; runFamily(); });
    s3.zoom.addEventListener('change', () => { zoomChosen = true; drawBanana(); });
    function drawBanana() {
      const { ctx, w, h } = fit(s3.canvas);
      if (!family) {
        ctx.fillStyle = C.text; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Choose a night and press “Predict”.', w / 2, h / 2);
        return;
      }
      const n = family.samples.length - 1, pts = family.out;
      const span = Number(s3.zoom.value), D = (v) => v / 3600;     // degrees
      const F = frame(ctx, w, h, { x0: span, x1: -span, y0: -span * h / w, y1: span * h / w,
        xlabel: 'East ← offset from the observed position (degrees) → west', ylabel: 'North offset (degrees)', left: 50 });
      F.clip();
      for (let i = 0; i < n; i++) {
        const f = (Math.log10(family.samples[i][0]) - Math.log10(FAM_LO)) / (Math.log10(rhoBound) - Math.log10(FAM_LO));
        dot(ctx, F.X(D(pts[2 * i])), F.Y(D(pts[2 * i + 1])), 2, lerpColour(VIR, f));
      }
      // the reader's guess (last sample) and the actual observation
      const gx = F.X(D(pts[2 * n])), gy = F.Y(D(pts[2 * n + 1]));
      ctx.strokeStyle = C.guess; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(gx, gy, 7, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(F.X(0) - 8, F.Y(0)); ctx.lineTo(F.X(0) + 8, F.Y(0)); ctx.moveTo(F.X(0), F.Y(0) - 8); ctx.lineTo(F.X(0), F.Y(0) + 8); ctx.stroke();
      ctx.restore();
      // summary
      let inside = 0;
      for (let i = 0; i < n; i++) if (Math.abs(D(pts[2 * i])) < span && Math.abs(D(pts[2 * i + 1])) < span * h / w) inside++;
      const miss = Math.hypot(pts[2 * n], pts[2 * n + 1]);
      const o = m.obs[family.target];
      $('od-fam-range').textContent = `${sig(FAM_LO)} au (purple) to ${sig(rhoBound)} au (yellow)`;
      s3.key.textContent = `Your guess (orange circle) misses the real position on ${calendar(o.t)} by ${angleFmt(miss)}. ${fmt(inside)} of ${fmt(n)} orbits fall inside this view.`;
      s3.canvas.setAttribute('aria-label', `Predicted positions of 2024 YR4 on ${calendar(o.t)} from ${n} orbits that all fit the discovery night, coloured by guessed distance; they form a long curved band through the actual position. Your guess misses by ${angleFmt(miss)}.`);
    }
    // keep the reader's own guess current in an existing family, cheaply
    let guessTimer = 0;
    function refreshGuessPoint() {
      if (!family || familyBusy) return;
      clearTimeout(guessTimer);
      guessTimer = setTimeout(async () => {
        const res = await call('banana', { tracklet: disc, target: family.target, samples: [[state.rho, state.rhod]] });
        const n = family.samples.length - 1;
        family.samples[n] = [state.rho, state.rhod];
        family.out[2 * n] = res.out[0]; family.out[2 * n + 1] = res.out[1];
        drawBanana();
      }, 120);
    }

    // ======================== 4. Gauss's method ===================================
    const s4 = { sel: [$('od-g1'), $('od-g2'), $('od-g3')], run: $('od-gauss-run'), roots: $('od-gauss-roots'), orbit: $('od-gauss-orbit'),
      res: $('od-gauss-res'), a: $('od-g-a'), e: $('od-g-e'), i: $('od-g-i'), rms: $('od-g-rms'), status: $('od-gauss-status'), presets: $('od-gauss-presets') };
    s4.sel.forEach((s) => m.tracklets.forEach((_, i) => {
      const opt = document.createElement('option'); opt.value = i; opt.textContent = trackletLabel(i); s.append(opt);
    }));
    const tDisc = m.obs[dks[0]].t;
    const after = (days) => m.tracklets.findIndex((tk) => m.obs[tk[0]].t > tDisc + days - 0.3);
    const dLabel = (i) => { const d = m.obs[m.tracklets[i][0]].t - tDisc; return d < 1 ? `${(d * 24).toFixed(1)} h` : `${Math.round(d)} d`; };
    const presets = [[disc, after(4), after(9)], [disc, disc + 1, disc + 2], [disc, after(1), after(2)], [disc, after(17), after(36)]]
      .map((trio) => [`Discovery, +${dLabel(trio[1])}, +${dLabel(trio[2])}`, trio]);
    presets.forEach(([label, trio]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ro-chip'; b.textContent = label;
      b.addEventListener('click', () => { trio.forEach((v, k) => { s4.sel[k].value = v; }); runGauss(); });
      s4.presets.append(b);
    });
    presets[0][1].forEach((v, k) => { s4.sel[k].value = v; });
    let gauss = null;
    function runGauss() {
      const trks = s4.sel.map((s) => Number(s.value));
      const ks = trks.map((i) => m.tracklets[i][m.tracklets[i].length >> 1]);
      const ts = ks.map((k) => m.obs[k].t);
      s4.roots.replaceChildren();
      if (new Set(trks).size < 3 || !(ts[0] < ts[1] && ts[1] < ts[2])) {
        s4.status.textContent = 'Choose three different tracklets, in time order.';
        gauss = null; drawGauss(); return;
      }
      const sols = od.gauss(m, ks);
      if (!sols.length) {
        s4.status.textContent = 'No solution: the polynomial has no usable positive root for these three observations.';
        gauss = null; drawGauss(); return;
      }
      gauss = { ks, sols, pick: 0, res: null };
      if (sols.length > 1) {
        sols.forEach((s, i) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'ro-chip'; b.setAttribute('aria-pressed', String(i === 0));
          b.textContent = `Root ${i + 1}: ${sig(s.rho2)} au from the observer`;
          b.addEventListener('click', () => { gauss.pick = i; [...s4.roots.children].forEach((c, j) => c.setAttribute('aria-pressed', String(j === i))); gaussResiduals(); drawGauss(); });
          s4.roots.append(b);
        });
      }
      s4.status.textContent = sols.length > 1 ? `${sols.length} possible orbits: Gauss’s polynomial has more than one positive root.` : 'One solution.';
      gaussResiduals(); drawGauss();
    }
    function gaussResiduals() {
      const s = gauss.sols[gauss.pick];
      gauss.res = od.keplerMisses(m, s.xh, s.t);
    }
    function drawGauss() {
      const jel = od.elements(helio(m.jpl.epoch_state, m.epoch), m.gm[0]);
      if (!gauss) {
        drawOrbit(s4.orbit, [{ xh: helio(jplTraj.at(att.t), att.t), colour: C.jpl, dash: [6, 4] }], att.t, 'Seen from ecliptic north');
        fit(s4.res);
        [s4.a, s4.e, s4.i, s4.rms].forEach((el) => { el.textContent = '–'; });
        return;
      }
      const s = gauss.sols[gauss.pick], el = od.elements(s.xh, m.gm[0]);
      drawOrbit(s4.orbit, [{ xh: helio(jplTraj.at(s.t), s.t), colour: C.jpl, dash: [6, 4] }, { xh: s.xh, colour: C.guess }], s.t,
        `Seen from ecliptic north, ${calendar(s.t)}`);
      s4.a.textContent = el.e < 1 ? `${sig(el.a)} au (JPL ${sig(jel.a)})` : 'unbound';
      s4.e.textContent = `${el.e.toFixed(3)} (JPL ${jel.e.toFixed(3)})`;
      s4.i.textContent = `${el.i.toFixed(2)}° (JPL ${jel.i.toFixed(2)}°)`;
      const rs = [...gauss.res].sort((p, q) => p - q);
      s4.rms.textContent = angleFmt(rs[rs.length >> 1]);
      // residuals over the six weeks
      const { ctx, w, h } = fit(s4.res);
      const t0 = m.obs[0].t;
      const ymax = Math.max(10, ...gauss.res.filter(Number.isFinite)) * 1.5;
      const F = frame(ctx, w, h, { x0: -1, x1: m.obs[m.obs.length - 1].t - t0 + 1, y0: 0.01, y1: Math.min(ymax, 2e5), ylog: true,
        xlabel: `Days after ${calendar(t0)}`, ylabel: 'Miss distance (arcsec)', yfmt: logLabel });
      F.clip();
      ctx.strokeStyle = C.axis; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(F.L, F.Y(0.5)); ctx.lineTo(F.L + F.pw, F.Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
      m.obs.forEach((o, k) => dot(ctx, F.X(o.t - t0), F.Y(Math.max(0.011, gauss.res[k])), 2, 'rgba(24,50,63,0.55)'));
      gauss.ks.forEach((k) => {
        ctx.strokeStyle = C.guess; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(F.X(m.obs[k].t - t0), F.Y(Math.max(0.011, gauss.res[k])), 6, 0, 2 * Math.PI); ctx.stroke();
      });
      ctx.restore();
      s4.res.setAttribute('aria-label', `How far each of the ${m.obs.length} observations lies from the Gauss orbit, against time: the median miss is ${angleFmt(rs[rs.length >> 1])}, the largest ${angleFmt(rs[rs.length - 1])}.`);
    }
    s4.run.addEventListener('click', runGauss);

    // ======================== 5. Least squares ====================================
    const s5 = { arc: $('od-arc'), arcOut: $('od-arc-out'), status: $('od-fit-status'), res: $('od-fit-res'), cloud: $('od-cloud'), trend: $('od-trend'),
      used: $('od-f-used'), rms: $('od-f-rms'), a: $('od-f-a'), e: $('od-f-e'), i: $('od-f-i'), q: $('od-f-q'), unc: $('od-f-unc'),
      all: $('od-fit-all') };
    const fits = new Map();
    let fitBusy = false, lastStart = null;
    const arcTracklets = (days) => m.tracklets.map((_, i) => i).filter((i) => m.obs[m.tracklets[i][0]].t < m.obs[0].t + days);
    function arcLabel(days) {
      const trks = arcTracklets(days), n = trks.reduce((s, i) => s + m.tracklets[i].length, 0);
      return `${days} days: ${calendar(m.obs[0].t)} to ${calendar(m.obs[0].t + days - 1)}, ${fmt(n)} observations`;
    }
    function spread(cloud) {
      const n = cloud.length / 2;
      let mx = 0, my = 0;
      for (let i = 0; i < n; i++) { mx += cloud[2 * i]; my += cloud[2 * i + 1]; }
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < n; i++) { const dx = cloud[2 * i] - mx, dy = cloud[2 * i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
      const tr = (sxx + syy) / 2, det = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
      return { major: Math.sqrt(tr + det), minor: Math.sqrt(Math.max(0, tr - det)), mx, my };
    }
    async function runFit(ai) {
      const days = ARCS[ai];
      if (fits.has(days)) { showFit(days); return; }
      if (fitBusy) return;
      fitBusy = true; s5.all.disabled = true;
      s5.status.textContent = `Fitting ${arcLabel(days).split(':')[0]} of observations…`;
      const t0 = performance.now();
      try {
        const r = await call('fit', { trks: arcTracklets(days), start: lastStart, nSamples: 300 });
        if (r.ok) { r.time = performance.now() - t0; r.spread = spread(r.cloud); fits.set(days, r); lastStart = r.x; }
        else fits.set(days, { ok: false });
      } catch (e) {
        fits.set(days, { ok: false, error: e.message });
      }
      fitBusy = false; s5.all.disabled = false;
      if (ARCS[Number(s5.arc.value)] === days) showFit(days);
      drawTrend();
    }
    function showFit(days) {
      const f = fits.get(days);
      if (!f || !f.ok) {
        s5.status.textContent = 'The fit did not converge for this arc.';
        return;
      }
      const used = f.use.filter(Boolean).length;
      s5.status.textContent = `Fitted in ${sig(f.time / 1000)} s.`;
      s5.used.textContent = `${fmt(used)} of ${fmt(f.use.length)}`;
      s5.rms.textContent = `${f.rms.toFixed(2)}″`;
      s5.a.textContent = `${f.elements.a.toFixed(4)} ± ${sig(f.sigma.a)} au`;
      s5.e.textContent = `${f.elements.e.toFixed(4)} ± ${sig(f.sigma.e)}`;
      s5.i.textContent = `${f.elements.i.toFixed(3)} ± ${sig(f.sigma.i)}°`;
      s5.q.textContent = `${f.elements.q.toFixed(4)} ± ${sig(f.sigma.q)} au`;
      s5.unc.textContent = angleFmt(f.spread.major);
      drawFitRes(f); drawCloud(f);
    }
    function drawFitRes(f) {
      const { ctx, w, h } = fit(s5.res);
      const t0 = m.obs[0].t, lim = 3;
      const F = frame(ctx, w, h, { x0: -1, x1: 47, y0: -lim, y1: lim, xlabel: `Days after ${calendar(t0)}`, ylabel: 'Residual (arcsec)' });
      F.clip();
      f.idx.forEach((k, j) => {
        const x = F.X(m.obs[k].t - t0);
        [[f.dra[j], C.ra], [f.ddec[j], C.dec]].forEach(([v, col]) => {
          const y = F.Y(Math.max(-lim, Math.min(lim, v)));
          if (f.use[j]) dot(ctx, x, y, 2.2, col);
          else { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.stroke(); }
        });
      });
      ctx.restore();
      s5.res.setAttribute('aria-label', `Residuals of the ${f.use.length} observations in the fit, in right ascension and declination: root mean square ${f.rms.toFixed(2)} arcseconds; ${f.use.length - f.use.filter(Boolean).length} rejected as outliers.`);
    }
    function drawCloud(f) {
      const { ctx, w, h } = fit(s5.cloud);
      const sp = f.spread, n = f.cloud.length / 2;
      let ext = Math.max(4 * sp.major, Math.hypot(f.nominal[0], f.nominal[1]) * 1.3, 1);
      const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6];
      ext = nice.find((v) => v >= ext) || ext;
      const unit = ext >= 7200 ? [3600, '°'] : ext >= 120 ? [60, '′'] : [1, '″'];
      const lab = (v) => String(Number((v / unit[0]).toPrecision(3))).replace('-', '−');
      const F = frame(ctx, w, h, { x0: ext, x1: -ext, y0: -ext * h / w, y1: ext * h / w, xfmt: lab, yfmt: lab,
        xlabel: `East ← offset on ${calendar(m.predict)} (${unit[1]}) → west`, ylabel: `North (${unit[1]})`, left: 50 });
      F.clip();
      for (let i = 0; i < n; i++) dot(ctx, F.X(f.cloud[2 * i]), F.Y(f.cloud[2 * i + 1]), 2, 'rgba(217,130,43,0.55)');
      ctx.strokeStyle = C.jpl; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(F.X(0) - 8, F.Y(0)); ctx.lineTo(F.X(0) + 8, F.Y(0)); ctx.moveTo(F.X(0), F.Y(0) - 8); ctx.lineTo(F.X(0), F.Y(0) + 8); ctx.stroke();
      ctx.restore();
      s5.cloud.setAttribute('aria-label', `Where 300 orbits consistent with the fit put 2024 YR4 on ${calendar(m.predict)}, seen from the Earth's centre, around the position from JPL's orbit (a teal cross): the spread is ${angleFmt(sp.major)} along its longest direction.`);
    }
    function drawTrend() {
      const { ctx, w, h } = fit(s5.trend);
      const pts = ARCS.filter((d) => fits.get(d)?.ok).map((d) => [d, fits.get(d).spread.major]);
      const F = frame(ctx, w, h, { x0: 1.5, x1: 60, y0: 0.5, y1: 200, xlog: true, ylog: true, xfmt: logLabel, yfmt: (v) => `${v}″`,
        xlabel: 'Days of observations', ylabel: `Uncertainty on ${calendar(m.predict)}`, left: 52 });
      F.clip();
      ctx.strokeStyle = C.guess; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach(([d, u], i) => (i ? ctx.lineTo(F.X(d), F.Y(u)) : ctx.moveTo(F.X(d), F.Y(u))));
      ctx.stroke();
      pts.forEach(([d, u]) => dot(ctx, F.X(d), F.Y(u), 4, C.guess));
      ctx.restore();
      s5.trend.setAttribute('aria-label', pts.length ? `Uncertainty on ${calendar(m.predict)} against the number of days of observations: ${pts.map(([d, u]) => `${d} days, ${angleFmt(u)}`).join('; ')}.` : 'No fits yet.');
    }
    s5.arc.max = ARCS.length - 1;
    s5.arc.addEventListener('input', () => { s5.arcOut.textContent = arcLabel(ARCS[Number(s5.arc.value)]); });
    s5.arc.addEventListener('change', () => runFit(Number(s5.arc.value)));
    s5.all.addEventListener('click', async () => {
      for (let i = 0; i < ARCS.length; i++) { if (!fits.has(ARCS[i])) await runFit(i); }
      showFit(ARCS[Number(s5.arc.value)]);
    });
    s5.arcOut.textContent = arcLabel(ARCS[Number(s5.arc.value)]);

    // ======================== start ==============================================
    syncAll();
    runGauss();
    drawTrend();
    // the family and the first fit are computed when their sections come into view
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        if (en.target.id === 'od-next' && !family) runFamily();
        if (en.target.id === 'od-many' && !fits.size) runFit(Number(s5.arc.value));
        io.unobserve(en.target);
      }
    }, { rootMargin: '200px' });
    io.observe($('od-next')); io.observe($('od-many'));
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        regionKey = '';
        syncAll(); drawGauss(); drawTrend();
        const f = fits.get(ARCS[Number(s5.arc.value)]);
        if (f && f.ok) { drawFitRes(f); drawCloud(f); }
      }, 150);
    });
    // a new guess also moves its point among the predictions
    [s1.dist, s2.dist, s2.rhod].forEach((el) => el.addEventListener('change', refreshGuessPoint));
    s2.region.addEventListener('click', refreshGuessPoint);
    s2.region.addEventListener('keyup', refreshGuessPoint);
  }
}
