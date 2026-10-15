// Interactive page on interstellar objects and the LSST (after Hoover, Seligman &
// Payne 2022): (1) the sky map of arrival directions, computed live from the
// Galactic kinematics; (2) one visitor followed night by night, drawn at random or
// set by hand, or one of the three known visitors on its real orbit; (3) the
// notebook's million-object population, re-counted for any absolute magnitude,
// limiting magnitude and Delta-v. Nothing moves on its own; the population data
// load when section 3 is near.
import * as P from './physics.js';
import { COLORS, fit, frame, dot, fmt, sig } from '../plotting.js';

const DEG = Math.PI / 180;
const SQ2 = Math.SQRT2;
const MAGMA = ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55064', '#fb8761', '#fec287', '#fcfdbf'];
const KNOWN_STYLE = { '1I/ʻOumuamua': '#d62728', '2I/Borisov': '#ff9f1c', '3I/ATLAS': '#e040fb' };
// Perihelion times (JD, TDB) from the JPL Small-Body Database, retrieved 2026-10-15.
const KNOWN_TP = { '1I/ʻOumuamua': 2458006.007321375, '2I/Borisov': 2458826.052845906, '3I/ATLAS': 2460977.995262848 };
const ECLIPTIC = P.greatCircle('ecliptic'), GALACTIC = P.greatCircle('galactic');
const KNOWN_ASYM = Object.fromEntries(Object.entries(P.KNOWN).map(([k, v]) => [k, P.asymptote(v)]));

function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
const MAGMA_RGB = MAGMA.map(hexRgb);
function magma(t) {
  t = Math.max(0, Math.min(1, t)) * (MAGMA_RGB.length - 1);
  const i = Math.min(Math.floor(t), MAGMA_RGB.length - 2), f = t - i;
  return MAGMA_RGB[i].map((c, k) => Math.round(c + f * (MAGMA_RGB[i + 1][k] - c)));
}

const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const dateStr = (jd) => jdToDate(jd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------- Mollweide sky
function mollweide(w, h) {
  const s = Math.min(w / (4 * SQ2), h / (2 * SQ2)) * 0.96, cx = w / 2, cy = h / 2;
  const lam = (ra) => (((180 - ra + 180) % 360 + 360) % 360 - 180) * DEG;   // RA increases to the left
  function fwd(ra, dec) {
    const phi = dec * DEG;
    let th = phi;
    if (Math.abs(phi) > 89.999 * DEG) th = Math.sign(phi) * Math.PI / 2;
    else for (let k = 0; k < 30; k++) { const d = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(phi)) / (2 + 2 * Math.cos(2 * th)); th -= d; if (Math.abs(d) < 1e-9) break; }
    return [cx + s * (2 * SQ2 / Math.PI) * lam(ra) * Math.cos(th), cy - s * SQ2 * Math.sin(th)];
  }
  function inv(px, py) {
    const x = (px - cx) / s, y = -(py - cy) / s;
    if (Math.abs(y) > SQ2) return null;
    const th = Math.asin(y / SQ2);
    const l = Math.PI * x / (2 * SQ2 * Math.cos(th));
    if (Math.abs(l) > Math.PI) return null;
    const dec = Math.asin((2 * th + Math.sin(2 * th)) / Math.PI) / DEG;
    return [((180 - l / DEG) % 360 + 360) % 360, dec];
  }
  return { fwd, inv, s, cx, cy };
}

function skyLines(ctx, M, { lsst = false } = {}) {
  const line = (pts, colour, dash) => {
    ctx.strokeStyle = colour; ctx.setLineDash(dash); ctx.lineWidth = 1.4; ctx.beginPath();
    let prev = null;
    for (const [ra, dec] of pts) {
      const [x, y] = M.fwd(ra, dec);
      if (prev && Math.abs(x - prev[0]) < M.s * 2) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      prev = [x, y];
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  // graticule
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  for (let dec = -60; dec <= 60; dec += 30) line(Array.from({ length: 181 }, (_, k) => [k * 2, dec]), 'rgba(255,255,255,0.18)', []);
  for (let ra = 0; ra < 360; ra += 60) line(Array.from({ length: 91 }, (_, k) => [ra + 1e-6, -90 + k * 2]), 'rgba(255,255,255,0.18)', []);
  line(ECLIPTIC, '#ffffff', []);
  line(GALACTIC, 'rgba(255,255,255,0.75)', [2, 4]);
  if (lsst) line(Array.from({ length: 181 }, (_, k) => [k * 2, 12]), '#24b9be', [6, 4]);
}

function skyMarkers(ctx, M, apex, extra = []) {
  const mark = (ra, dec, colour, label, shape) => {
    const [x, y] = M.fwd(ra, dec);
    ctx.fillStyle = colour; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (shape === 'ring') { ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; }
    else if (shape === 'square') ctx.rect(x - 5, y - 5, 10, 10);
    else ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
    ctx.fill(); ctx.stroke();
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(label, x + 9, y);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x + 9, y);
  };
  mark(apex[0], apex[1], '#fff', 'solar apex', 'ring');
  for (const [k, a] of Object.entries(KNOWN_ASYM)) mark(a.radiant[0], a.radiant[1], KNOWN_STYLE[k], k.split('/')[0], 'dot');
  for (const e of extra) mark(e.ra, e.dec, e.colour, e.label, 'square');
}

const angSep = (a, b) => Math.acos(Math.max(-1, Math.min(1,
  Math.sin(a[1] * DEG) * Math.sin(b[1] * DEG) + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.cos((a[0] - b[0]) * DEG)))) / DEG;

/** State on the 5 au sphere, inbound, of a known visitor's real (two-body) orbit. */
function knownStart(name) {
  const k = P.KNOWN[name], tp = KNOWN_TP[name];
  const A = k.q / (k.e - 1), n = Math.sqrt(P.GM_SUN / A ** 3);
  const F = -Math.acosh((1 + P.R_START / A) / k.e);
  const t = tp + (k.e * Math.sinh(F) - F) / n;
  const [i, Om, w] = [k.i * DEG, k.Om * DEG, k.w * DEG];
  const Pv = [Math.cos(Om) * Math.cos(w) - Math.sin(Om) * Math.sin(w) * Math.cos(i), Math.sin(Om) * Math.cos(w) + Math.cos(Om) * Math.sin(w) * Math.cos(i), Math.sin(w) * Math.sin(i)];
  const Qv = [-Math.cos(Om) * Math.sin(w) - Math.sin(Om) * Math.cos(w) * Math.cos(i), -Math.sin(Om) * Math.sin(w) + Math.cos(Om) * Math.cos(w) * Math.cos(i), Math.cos(w) * Math.sin(i)];
  const x = A * (k.e - Math.cosh(F)), y = A * Math.sqrt(k.e ** 2 - 1) * Math.sinh(F);
  const Fd = n / (k.e * Math.cosh(F) - 1), xd = -A * Math.sinh(F) * Fd, yd = A * Math.sqrt(k.e ** 2 - 1) * Math.cosh(F) * Fd;
  return { r0: [0, 1, 2].map((c) => x * Pv[c] + y * Qv[c]), v0: [0, 1, 2].map((c) => xd * Pv[c] + yd * Qv[c]), jd0: t };
}

export function startISO(base) {
  const $ = (id) => document.getElementById(id);
  const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const kin = () => ({ pop: radio('iso-pop'), solar: $('iso-solar').value, focus: $('iso-focus').checked });

  // ============================ 1. The sky of arrivals ===============================
  const skyCanvas = $('iso-sky'), skyRead = $('iso-sky-read');
  let sky = null, skyKey = '';
  function computeSky() {
    const k = kin(), key = JSON.stringify(k);
    if (key === skyKey) return;
    skyKey = key;
    sky = { ...P.radiantMap(k.pop, k.solar, k.focus), apex: P.solarApex(k.solar) };
  }
  function drawSky() {
    computeSky();
    const { ctx, w, h } = fit(skyCanvas);
    const M = mollweide(w, h);
    const img = ctx.createImageData(Math.round(w), Math.round(h));
    for (let py = 0; py < img.height; py++) {
      for (let px = 0; px < img.width; px++) {
        const rd = M.inv(px + 0.5, py + 0.5);
        if (!rd) continue;
        const i = Math.min(sky.nRa - 1, Math.floor(rd[0] / 360 * sky.nRa));
        const j = Math.min(sky.nDec - 1, Math.floor((rd[1] + 90) / 180 * sky.nDec));
        const c = magma(sky.map[j * sky.nRa + i]);
        const o = 4 * (py * img.width + px);
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    const off = document.createElement('canvas'); off.width = img.width; off.height = img.height;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0, w, h);
    skyLines(ctx, M);
    const extra = visitor ? [{ ra: visitor.radiant[0], dec: visitor.radiant[1], colour: '#24b9be', label: 'your visitor' }] : [];
    skyMarkers(ctx, M, sky.apex, extra);
    // RA labels along the equator
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let ra = 0; ra < 360; ra += 60) { const [x, y] = M.fwd(ra + 1e-6, 0); ctx.fillText(`${ra / 15}h`, x, y + 3); }
    skyCanvas._M = M;
  }
  skyCanvas.addEventListener('pointermove', (ev) => {
    if (!sky || !skyCanvas._M) return;
    const r = skyCanvas.getBoundingClientRect();
    const rd = skyCanvas._M.inv(ev.clientX - r.left, ev.clientY - r.top);
    if (!rd) { skyRead.textContent = 'Point at the map to read it.'; return; }
    const i = Math.min(sky.nRa - 1, Math.floor(rd[0] / 360 * sky.nRa)), j = Math.min(sky.nDec - 1, Math.floor((rd[1] + 90) / 180 * sky.nDec));
    skyRead.textContent = `RA ${(rd[0] / 15).toFixed(1)}h, Dec ${rd[1] >= 0 ? '+' : '−'}${Math.abs(rd[1]).toFixed(0)}°: ${(100 * sky.map[j * sky.nRa + i]).toFixed(0)}% of the peak; ${angSep(rd, sky.apex).toFixed(0)}° from the solar apex.`;
  });
  document.querySelectorAll('input[name="iso-pop"], #iso-solar, #iso-focus').forEach((el) => el.addEventListener('change', () => {
    drawSky(); $('iso-apex').textContent = apexText();
  }));
  const apexText = () => { const a = P.solarApex($('iso-solar').value); return `Solar apex: RA ${(a[0] / 15).toFixed(1)}h, Dec +${a[1].toFixed(0)}°.`; };
  $('iso-apex').textContent = apexText();

  // ============================ 2. One visitor =======================================
  const inp = { v: $('iso-v'), b: $('iso-b'), psi: $('iso-psi'), day: $('iso-day'), H: $('iso-H'), lim: $('iso-lim'), t: $('iso-t') };
  const out = { v: $('iso-v-out'), b: $('iso-b-out'), psi: $('iso-psi-out'), day: $('iso-day-out'), H: $('iso-H-out'), lim: $('iso-lim-out'), t: $('iso-t-out') };
  const orbitCanvas = $('iso-orbit'), lcCanvas = $('iso-lc'), summary = $('iso-summary'), facts = $('iso-facts');
  let seed = 7, visitor = null, tr = null;

  function fromDraw(v) {
    const vh = Math.hypot(...v.vGal);
    visitor = { mode: 'drawn', dir: v.vGal.map((c) => c / vh), vInf: vh, b: v.b, psi: v.psi, day: v.day };
    visitor.radiant = P.radec(P.galToEq(visitor.dir.map((c) => -c)));
    inp.v.value = String(Math.min(100, Math.max(1, vh)).toFixed(1));
    inp.b.value = String(v.b.toFixed(2)); inp.psi.value = String(Math.round(v.psi / DEG) % 360); inp.day.value = String(v.day);
    setManual(true);
  }
  function setManual(on) { [inp.v, inp.b, inp.psi, inp.day].forEach((el) => { el.disabled = !on; }); }
  function compute() {
    if (visitor.mode === 'drawn') {
      visitor.vInf = Number(inp.v.value); visitor.b = Number(inp.b.value); visitor.psi = Number(inp.psi.value) * DEG; visitor.day = Number(inp.day.value);
      const { r0, v0 } = P.place(visitor.dir.map((c) => c * visitor.vInf), Math.min(visitor.b, 4.999), visitor.psi);
      visitor.jd0 = 2459215.5 + visitor.day;
      tr = P.track(r0, v0, visitor.jd0);
    } else {
      const s = knownStart(visitor.name);
      visitor.jd0 = s.jd0;
      tr = P.track(s.r0, s.v0, s.jd0);
    }
    inp.t.max = String(tr.N - 1);
  }
  function showValues() {
    const known = visitor && visitor.mode === 'known';
    out.v.textContent = known ? `${KNOWN_ASYM[visitor.name].vInf.toFixed(1)} km/s (real orbit)` : `${Number(inp.v.value).toFixed(1)} km/s`;
    out.b.textContent = known ? 'set by the real orbit' : `${Number(inp.b.value).toFixed(2)} au`;
    out.psi.textContent = known ? 'set by the real orbit' : `${inp.psi.value}°`;
    out.day.textContent = known ? `${dateStr(visitor.jd0)} (5 au from the Sun)` : dateStr(2459215.5 + Number(inp.day.value));
    out.H.textContent = `H = ${Number(inp.H.value).toFixed(1)}`;
    out.lim.textContent = `m ≤ ${Number(inp.lim.value).toFixed(1)}`;
    out.t.textContent = tr ? `day ${inp.t.value}: ${dateStr(visitor.jd0 + Number(inp.t.value))}` : '';
  }

  function drawOrbit() {
    const { ctx, w, h } = fit(orbitCanvas);
    const span = 5.6, s = Math.min(w, h) / (2 * span), cx = w / 2, cy = h / 2;
    const X = (x) => cx + x * s, Y = (y) => cy - y * s;
    ctx.fillStyle = '#fbfdfd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.grid; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(cx, cy, 5 * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('5 au', X(3.6) , Y(-3.75));
    // Earth's orbit and path
    ctx.strokeStyle = '#9ec5e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, s, 0, 2 * Math.PI); ctx.stroke();
    const H = Number(inp.H.value), lim = Number(inp.lim.value), dm = H - P.H_OUMUAMUA;
    // object path, highlighted where detectable
    ctx.lineWidth = 2;
    for (let d = 1; d < tr.N; d++) {
      const good = tr.obs[d] && tr.m[d] + dm <= lim && tr.m[d] + dm > P.M_BRIGHT;
      ctx.strokeStyle = good ? '#ff7f0e' : '#bcc8cd';
      ctx.beginPath(); ctx.moveTo(X(tr.x[d - 1]), Y(tr.y[d - 1])); ctx.lineTo(X(tr.x[d]), Y(tr.y[d])); ctx.stroke();
    }
    dot(ctx, cx, cy, 6, '#f2c200');
    const t = Number(inp.t.value);
    dot(ctx, X(tr.ex[t]), Y(tr.ey[t]), 5, '#1f77b4');
    dot(ctx, X(tr.x[t]), Y(tr.y[t]), 5, '#d35400');
    ctx.strokeStyle = 'rgba(31,119,180,0.6)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(tr.ex[t]), Y(tr.ey[t])); ctx.lineTo(X(tr.x[t]), Y(tr.y[t])); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLORS.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Seen from above the ecliptic', 8, 8);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('orange: detectable by Rubin', 8, 26);
  }

  function drawLC() {
    const { ctx, w, h } = fit(lcCanvas);
    const H = Number(inp.H.value), lim = Number(inp.lim.value), dm = H - P.H_OUMUAMUA;
    let mmin = Infinity;
    for (let d = 0; d < tr.N; d++) mmin = Math.min(mmin, tr.m[d] + dm);
    const top = Math.min(16, Math.floor(mmin) - 1);
    // show the stretch of the 3 years when the visitor is brighter than m = 29
    let d0 = tr.N - 1, d1 = 0;
    for (let d = 0; d < tr.N; d++) if (tr.m[d] + dm < 29) { d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
    if (d1 < d0) { d0 = 0; d1 = tr.N - 1; }
    d0 = Math.max(0, d0 - 15); d1 = Math.min(tr.N - 1, Math.max(d1 + 15, d0 + 60));
    const yt = []; for (let v = Math.ceil(top / 2) * 2; v <= 30; v += 2) yt.push(v);
    const f = frame(ctx, w, h, { x0: d0, x1: d1, y0: 30, y1: top, yticks: yt, xlabel: `days since ${dateStr(visitor.jd0)}`, ylabel: 'apparent magnitude', xticks: 6 });
    f.clip();
    ctx.fillStyle = 'rgba(7,141,151,0.08)';
    ctx.fillRect(f.L, f.Y(lim), f.pw, f.Y(P.M_BRIGHT) - f.Y(lim));
    ctx.strokeStyle = COLORS.ink; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(f.L, f.Y(lim)); ctx.lineTo(f.L + f.pw, f.Y(lim)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#9aa9b0'; ctx.lineWidth = 1; ctx.beginPath();
    for (let d = 0; d < tr.N; d++) { const y = f.Y(Math.min(tr.m[d] + dm, 31)); d ? ctx.lineTo(f.X(d), y) : ctx.moveTo(f.X(d), y); }
    ctx.stroke();
    for (let d = 0; d < tr.N; d++) if (tr.obs[d] && tr.m[d] + dm < 30) dot(ctx, f.X(d), f.Y(tr.m[d] + dm), 1.6, '#ff7f0e');
    const det = P.firstDetection(tr, H, lim);
    ctx.lineWidth = 1.5;
    if (det >= 0) { ctx.strokeStyle = '#ff7f0e'; ctx.beginPath(); ctx.moveTo(f.X(det), f.T); ctx.lineTo(f.X(det), f.T + f.ph); ctx.stroke(); }
    ctx.strokeStyle = '#1f77b4'; ctx.beginPath(); ctx.moveTo(f.X(tr.tClosest), f.T); ctx.lineTo(f.X(tr.tClosest), f.T + f.ph); ctx.stroke();
    const t = Number(inp.t.value);
    ctx.strokeStyle = COLORS.ink; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(f.X(t), f.T); ctx.lineTo(f.X(t), f.T + f.ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = '#1f77b4'; ctx.fillText('blue: closest to Earth', f.L + 6, f.T + 4);
    if (det >= 0) { ctx.fillStyle = '#c55a00'; ctx.fillText('orange: observable from Rubin; line: first detectable', f.L + 6, f.T + 18); }
  }

  function describe() {
    const H = Number(inp.H.value), lim = Number(inp.lim.value);
    const det = P.firstDetection(tr, H, lim), dv = P.deltaV(tr, det);
    const name = visitor.mode === 'known' ? visitor.name : 'This visitor';
    const vinf = visitor.mode === 'known' ? KNOWN_ASYM[visitor.name].vInf : visitor.vInf;
    const rad = visitor.mode === 'known' ? KNOWN_ASYM[visitor.name].radiant : visitor.radiant;
    let mmin = Infinity; for (let d = 0; d < tr.N; d++) mmin = Math.min(mmin, tr.m[d] + H - P.H_OUMUAMUA);
    const rows = [
      ['Speed far from the Sun, v∞', `${vinf.toFixed(1)} km/s`],
      ['Arrives from', `RA ${(rad[0] / 15).toFixed(1)}h, Dec ${rad[1] >= 0 ? '+' : '−'}${Math.abs(rad[1]).toFixed(0)}°`],
      ['Perihelion', `${tr.el.q.toFixed(2)} au, on ${dateStr(visitor.jd0 + tr.el.tPeri)}`],
      ['Inclination to the ecliptic', `${tr.el.inc.toFixed(0)}°`],
      ['Closest to Earth', `${tr.dMin.toFixed(2)} au, on ${dateStr(visitor.jd0 + tr.tClosest)}`],
      ['Brightest (any night)', `m = ${mmin.toFixed(1)}`]
    ];
    facts.replaceChildren(...rows.map(([k, v]) => { const d = document.createElement('div'); d.innerHTML = `<dt>${k}</dt><dd>${v}</dd>`; return d; }));
    let text;
    if (det < 0) {
      text = mmin <= lim ? `${name} gets brighter than m = ${lim.toFixed(1)}, but never while Rubin can see it: it is too close to the Sun, too far north or too low in the sky on those nights.`
        : `${name} never gets brighter than m = ${lim.toFixed(1)}: Rubin would not see it.`;
    } else {
      const wait = tr.tClosest - det;
      text = `Rubin could first detect ${visitor.mode === 'known' ? visitor.name : 'it'} on ${dateStr(visitor.jd0 + det)}, `
        + (wait > 0 ? `${Math.round(wait)} days before its closest approach to Earth. Δv ≈ distance ÷ time = ${dv < 1000 ? sig(dv) : fmt(dv)} km/s${dv < 20 ? ': within reach of a mission like those in the paper (Δv < 20 km/s).' : ': beyond the paper’s 20 km/s reach.'}`
          : `${Math.round(-wait)} days after its closest approach to Earth, too late for an intercept by the paper’s estimate.`);
    }
    if (visitor.mode === 'known' && visitor.name !== '1I/ʻOumuamua') text += ` (Treated as an inert body; the real ${visitor.name.split('/')[0]} was an active comet and far brighter.)`;
    summary.textContent = text;
  }

  function redrawVisitor() { showValues(); drawOrbit(); drawLC(); describe(); }
  function newVisitor() { compute(); inp.t.value = String(Math.max(0, P.firstDetection(tr, Number(inp.H.value), Number(inp.lim.value)))); redrawVisitor(); drawSky(); }

  $('iso-draw').addEventListener('click', () => {
    const k = kin();
    seed += 1;
    fromDraw(P.drawVisitor(seed, k.pop, k.solar, k.focus));
    newVisitor();
  });
  $('iso-close').addEventListener('click', () => {
    // keep drawing until a visitor that Rubin could detect turns up (at most 400 tries)
    const k = kin();
    for (let n = 0; n < 400; n++) {
      seed += 1;
      const v = P.drawVisitor(seed, k.pop, k.solar, k.focus);
      fromDraw(v); compute();
      if (P.firstDetection(tr, Number(inp.H.value), Number(inp.lim.value)) >= 0) break;
    }
    newVisitor();
  });
  document.querySelectorAll('[data-known]').forEach((b) => b.addEventListener('click', () => {
    visitor = { mode: 'known', name: b.dataset.known, radiant: KNOWN_ASYM[b.dataset.known].radiant };
    setManual(false);
    newVisitor();
  }));
  [inp.v, inp.b, inp.psi, inp.day].forEach((el) => el.addEventListener('input', () => { if (visitor.mode === 'drawn') { compute(); redrawVisitor(); } }));
  [inp.v, inp.b, inp.psi, inp.day].forEach((el) => el.addEventListener('change', drawSky));
  [inp.H, inp.lim].forEach((el) => el.addEventListener('input', redrawVisitor));
  inp.t.addEventListener('input', () => { showValues(); drawOrbit(); drawLC(); });

  // ============================ 3. The population ====================================
  const popStatus = $('iso-pop-status'), histCanvas = $('iso-hist'), popOut = $('iso-pop-out');
  const pin = { H: $('iso-pH'), lim: $('iso-plim'), dv: $('iso-pdv'), n0: $('iso-pn0') };
  const pout = { H: $('iso-pH-out'), lim: $('iso-plim-out'), dv: $('iso-pdv-out'), n0: $('iso-pn0-out') };
  const DV_STEPS = [2, 5, 10, 15, 20, 30, 50, 100];
  let pop = null, loading = false;
  const QUANT = {
    dmin: { label: 'closest approach to Earth (au)', col: 'd_min', lo: 0, hi: 2, bins: 40 },
    wait: { label: 'days from first detection to closest approach', lo: 0, hi: 250, bins: 50 },
    vinf: { label: 'v∞ (km/s)', col: 'v_inf', lo: 0, hi: 100, bins: 50 },
    q: { label: 'perihelion distance (au)', col: 'q', lo: 0, hi: 2.5, bins: 50 },
    inc: { label: 'inclination to the ecliptic (degrees)', col: 'inc', lo: 0, hi: 180, bins: 36 },
    b: { label: 'offset b on the 5 au sphere (au)', col: 'b', lo: 0, hi: 5, bins: 50 }
  };

  async function loadPop() {
    if (pop || loading) return;
    loading = true; popStatus.textContent = 'Loading the population (0.7 MB)…';
    try {
      const [meta, buf] = await Promise.all([
        fetch(`${base}data/iso/population.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch(`${base}data/iso/population.bin`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      ]);
      const raw = new Int16Array(buf), nc = meta.columns.length;
      const col = (name) => { const k = meta.columns.indexOf(name), s = meta.scale[name] || 1, a = new Float32Array(meta.n_rows); for (let r = 0; r < meta.n_rows; r++) a[r] = raw[r * nc + k] / s; return a; };
      const nT = meta.thresholds.length;
      const first = new Int16Array(meta.n_rows * nT);
      for (let r = 0; r < meta.n_rows; r++) for (let k = 0; k < nT; k++) first[r * nT + k] = raw[r * nc + k];
      pop = { meta, first, nT, t_ca: col('t_ca'), d_min: col('d_min'), v_inf: col('v_inf'), q: col('q'), inc: col('inc'), b: col('b') };
      popStatus.textContent = `${fmt(meta.n_total)} simulated objects, as in the notebook.`;
      drawPop();
    } catch (e) {
      popStatus.textContent = 'The population data could not be loaded. Try reloading the page.';
      loading = false;
    }
  }
  new IntersectionObserver((es, obs) => { if (es.some((e) => e.isIntersecting)) { loadPop(); obs.disconnect(); } }, { rootMargin: '400px' }).observe($('iso-population'));

  function drawPop() {
    const H = Number(pin.H.value), lim = Number(pin.lim.value), dvMax = DV_STEPS[Number(pin.dv.value)], n0 = Number(pin.n0.value);
    pout.H.textContent = `H = ${H.toFixed(1)}${Math.abs(H - 22.4) < 0.01 ? ' (ʻOumuamua)' : ''}`;
    pout.lim.textContent = `m ≤ ${lim.toFixed(1)}${lim === 24 ? ' (the LSST)' : ''}`;
    pout.dv.textContent = `Δv < ${dvMax} km/s`;
    pout.n0.textContent = `${n0.toFixed(2)} per au³`;
    if (!pop) return;
    const T = lim - (H - 22.4);
    const k = pop.meta.thresholds.findIndex((t) => Math.abs(t - T) < 1e-6);
    const N = pop.meta.n_total;
    const reach = pop.meta.reach_counts[k];
    const which = radio('iso-quant'), Q = QUANT[which];
    const hd = new Float64Array(Q.bins), hr = new Float64Array(Q.bins);
    let nDet = 0, nReach = 0;
    for (let r = 0; r < pop.meta.n_rows; r++) {
      const d = pop.first[r * pop.nT + k];
      if (d < 0) continue;
      nDet += 1;
      const wait = pop.t_ca[r] - d;
      const dv = wait > 0 ? pop.d_min[r] / wait * P.AU_KM / P.DAY_S : Infinity;
      const ok = dv < dvMax;
      if (ok) nReach += 1;
      const v = which === 'wait' ? (wait > 0 ? wait : NaN) : pop[Q.col][r];
      const bi = Math.floor((v - Q.lo) / (Q.hi - Q.lo) * Q.bins);
      if (bi >= 0 && bi < Q.bins) { hd[bi] += 1; if (ok) hr[bi] += 1; }
    }
    const f20 = P.rateFactor(20, n0), f40 = P.rateFactor(40, n0);
    const per = (n) => `${sig(n / N * f20)}–${sig(n / N * f40)} a year`;
    const decade = (n) => `${sig(10 * n / N * f20)}–${sig(10 * n / N * f40)}`;
    popOut.replaceChildren(...[
      ['Get brighter than the limit', `${(100 * reach / N).toFixed(2)}%`, per(reach)],
      ['Detectable by Rubin', `${(100 * nDet / N).toFixed(2)}%`, `${per(nDet)}; ${decade(nDet)} in 10 years`],
      [`Detectable and Δv < ${dvMax} km/s`, `${(100 * nReach / N).toFixed(3)}%`, `${per(nReach)}; ${decade(nReach)} in 10 years`]
    ].map(([a, b, c]) => { const d = document.createElement('div'); d.innerHTML = `<dt>${a}</dt><dd><b>${b}</b> of objects entering the 5 au sphere: ${c}</dd>`; return d; }));

    const { ctx, w, h } = fit(histCanvas);
    const sd = hd.reduce((a, b) => a + b, 0) || 1, sr = hr.reduce((a, b) => a + b, 0) || 1;
    let ymax = 0;
    for (let i = 0; i < Q.bins; i++) ymax = Math.max(ymax, hd[i] / sd, hr[i] / sr);
    const f = frame(ctx, w, h, { x0: Q.lo, x1: Q.hi, y0: 0, y1: ymax * 1.08 || 1, xlabel: Q.label, ylabel: 'fraction per bin', yfmt: (v) => `${(100 * v).toFixed(0)}%` });
    const step = (hist, s, colour) => {
      ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.beginPath();
      const bw = (Q.hi - Q.lo) / Q.bins;
      ctx.moveTo(f.X(Q.lo), f.Y(0));
      for (let i = 0; i < Q.bins; i++) { ctx.lineTo(f.X(Q.lo + i * bw), f.Y(hist[i] / s)); ctx.lineTo(f.X(Q.lo + (i + 1) * bw), f.Y(hist[i] / s)); }
      ctx.lineTo(f.X(Q.hi), f.Y(0)); ctx.stroke();
    };
    step(hd, sd, '#1f77b4');
    if (nReach) step(hr, sr, '#d62728');
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#1f77b4'; ctx.fillText(`detectable (${fmt(nDet)})`, f.L + f.pw - 8, f.T + 6);
    ctx.fillStyle = '#d62728'; ctx.fillText(`and Δv < ${dvMax} km/s (${fmt(nReach)})`, f.L + f.pw - 8, f.T + 22);
    histCanvas.setAttribute('aria-label', `Histogram of ${Q.label} for ${fmt(nDet)} detectable objects (blue) and ${fmt(nReach)} with Δv below ${dvMax} km/s (red).`);
  }
  Object.values(pin).forEach((el) => el.addEventListener('input', drawPop));
  document.querySelectorAll('input[name="iso-quant"]').forEach((el) => el.addEventListener('change', drawPop));

  // ============================ start ===============================================
  fromDraw(P.drawVisitor(seed));
  compute();
  // start on a detectable visitor, so that the first view shows the whole story
  while (P.firstDetection(tr) < 0) { seed += 1; fromDraw(P.drawVisitor(seed)); compute(); }
  inp.t.value = String(P.firstDetection(tr));
  redrawVisitor(); drawSky(); drawPop();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { drawSky(); redrawVisitor(); drawPop(); }); });
}
