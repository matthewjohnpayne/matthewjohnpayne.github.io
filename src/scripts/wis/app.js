// Interactive page on observatory positions (after the MPC's wis package) and parallax.
import { stationJ2000, julian, R_EARTH_KM } from './earth.js';
import { craftJ2000, craftRange } from './craft.js';
import { COLORS, fit, frame, dot, fmt } from '../plotting.js';

const BASE = `${import.meta.env.BASE_URL}data/wis/`;
const AU_KM = 149597870.7, C_KM_S = 299792.458, DEG = Math.PI / 180, AS = 180 * 3600 / Math.PI;
const MOON_KM = 384400;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const km = (x) => { const a = Math.abs(x), s = x < 0 ? '−' : ''; return a >= 1e5 ? `${s}${fmt(Math.round(a / 1000) * 1000)} km` : `${s}${fmt(a, a < 100 ? 1 : 0)} km`; };
/** An angle in arcseconds, in the most readable unit. */
const ang = (a) => (a >= 3600 ? `${(a / 3600).toFixed(a >= 36000 ? 0 : 1)}°` : a >= 60 ? `${(a / 60).toFixed(1)}′` : a >= 1 ? `${a.toFixed(a >= 10 ? 0 : 1)}″` : `${(a * 1000).toPrecision(2)} mas`);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Low-precision apparent RA/Dec of the Sun (Astronomical Almanac formula, ~0.01 deg). */
function sunRaDec(ms) {
  const n = julian(ms).jdTt - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG, eps = (23.439 - 4e-7 * n) * DEG;
  return [Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), Math.asin(Math.sin(eps) * Math.sin(lam))];
}

/** Offsets (arcsec) in RA cos(Dec) and Dec of a target at distance d (km) in direction (ra, dec)
 *  as seen from an observer at r (km), relative to the geocentric direction. */
function skyOffset(r, d, ra, dec) {
  const u = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const ea = [-Math.sin(ra), Math.cos(ra), 0], ed = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const v = u.map((c, k) => d * c - r[k]);
  const w = dot3(v, u);
  return [Math.atan2(dot3(v, ea), w) * AS, Math.atan2(dot3(v, ed), w) * AS];
}

export function startWis() {
  const $ = (id) => document.getElementById(id);
  const el = { code: $('wis-code'), list: $('wis-codes'), time: $('wis-time'), error: $('wis-error'), where: $('wis-where'), map: $('wis-map'), mapCap: $('wis-map-cap'),
    dist: $('wis-dist'), distOut: $('wis-dist-out'), ra: $('wis-ra'), raOut: $('wis-ra-out'), dec: $('wis-dec'), decOut: $('wis-dec-out'), opp: $('wis-opp'),
    track: $('wis-track'), read: $('wis-par-read') };
  let codes = new Map(), craft = {}, obs = null;

  const timeMs = () => { const v = el.time.value; const t = Date.parse(`${v}:00Z`); return Number.isFinite(t) ? t : Date.UTC(2026, 9, 13, 6); };
  const setTime = (ms) => { el.time.value = new Date(ms).toISOString().slice(0, 16); };
  function showError(m) { el.error.textContent = m; el.error.hidden = !m; }

  /** The chosen observatory: {code, name, kind, pos(ms)}. */
  function resolve(text) {
    const t = text.trim(), code = t.split(/\s+/)[0].toUpperCase();
    const pick = (c) => {
      if (craft[c]) return { code: c, name: craft[c].name, kind: 'space', pos: (ms) => craftJ2000(craft[c], ms), range: craftRange(craft[c]) };
      const r = codes.get(c);
      return r && { code: c, name: r[1], kind: 'ground', lon: r[2], rc: r[3], rs: r[4], pos: (ms) => stationJ2000(ms, r[2], r[3], r[4]) };
    };
    let o = pick(code);
    if (!o && t.length >= 3) {     // search by name
      const q = t.toLowerCase();
      const hit = [...codes.values()].find((r) => r[1].toLowerCase().includes(q)) || Object.entries(craft).find(([, c]) => c.name.toLowerCase().includes(q))?.[0];
      if (hit) o = pick(Array.isArray(hit) ? hit[0] : hit);
    }
    return o;
  }

  function choose(text) {
    const o = resolve(text);
    if (!o) { showError(`No observatory code or name matches “${text}”.`); return; }
    showError('');
    obs = o;
    if (o.range) {
      const t = timeMs();
      if (t < o.range[0] || t > o.range[1]) { setTime(Math.min(Math.max(t, o.range[0] + 60000), o.range[1] - 60000)); showError(`${o.name} positions here cover ${new Date(o.range[0]).toISOString().slice(0, 10)} to ${new Date(o.range[1]).toISOString().slice(0, 10)}, so the time has been moved into that range.`); }
    }
    render();
  }

  function render() {
    if (!obs) return;
    const t = timeMs();
    if (obs.range && (t < obs.range[0] || t > obs.range[1])) { showError(`${obs.name} positions here cover ${new Date(obs.range[0]).toISOString().slice(0, 16).replace('T', ' ')} to ${new Date(obs.range[1]).toISOString().slice(0, 16).replace('T', ' ')} UTC.`); return; }
    const r = obs.pos(t), dist = Math.hypot(...r);
    // summary
    const rows = [['Geocentric position (J2000)', `x ${km(r[0])}, y ${km(r[1])}, z ${km(r[2])}`], ['Distance from the Earth’s centre', `${km(dist)} = ${(dist / R_EARTH_KM).toFixed(dist < 2 * R_EARTH_KM ? 3 : 0)} Earth radii`],
      ['Light-travel time from the geocentre', dist / C_KM_S >= 1 ? `${(dist / C_KM_S).toFixed(2)} s` : `${(1000 * dist / C_KM_S).toFixed(1)} ms`]];
    if (obs.kind === 'ground') {
      const latc = Math.atan2(obs.rs, obs.rc) / DEG, lon = obs.lon > 180 ? obs.lon - 360 : obs.lon;
      rows.unshift(['Parallax constants', `longitude ${obs.lon.toFixed(4)}°, ρ cos φ′ ${obs.rc}, ρ sin φ′ ${obs.rs}`],
        ['Location', `${Math.abs(latc).toFixed(2)}° ${latc >= 0 ? 'N' : 'S'} (geocentric), ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`]);
    } else rows.unshift(['Source', 'spacecraft position from wis (SPICE kernels)']);
    el.where.innerHTML = `<h3>${esc(obs.code)} · ${esc(obs.name)}</h3><dl class="mo-dl wis-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    drawMap(t, r);
    renderParallax();
  }

  /** The observatory around the Earth, seen from above the north celestial pole (J2000 x-y). */
  function drawMap(t, r) {
    const { ctx, w, h } = fit(el.map);
    // the track: one day for a ground station, the data window around t for spacecraft
    const span = obs.kind === 'ground' ? 86400000 : obs.code === '250' ? 2 * 3600000 : 182 * 86400000;
    const pts = [];
    for (let k = -100; k <= 100; k++) { const p = obs.pos(t + (k / 100) * span / 2); if (p) pts.push(p); }
    const ext = 1.12 * Math.max(R_EARTH_KM * 1.15, ...pts.map((p) => Math.hypot(p[0], p[1])));
    const s = (Math.min(w, h) / 2 - 14) / ext, cx = w / 2, cy = h / 2, P = (p) => [cx + p[0] * s, cy - p[1] * s];
    if (MOON_KM < ext) { ctx.strokeStyle = COLORS.axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, MOON_KM * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = '#cfe3ea'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(R_EARTH_KM * s, 3), 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 1.5; ctx.beginPath();
    pts.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); ctx.lineWidth = 1;
    const [X, Y] = P(r); dot(ctx, X, Y, 5, '#c4160c');
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${km(ext)} to edge`, 8, 8);
    const what = obs.kind === 'ground' ? 'its path over 24 hours as the Earth turns (the Earth to scale)'
      : obs.code === '250' ? 'its orbit over two hours'
      : `its path over half a year either side${MOON_KM < ext ? ', with the Moon’s orbit dashed for scale' : ''}`;
    el.mapCap.textContent = `Seen from above the north celestial pole: the observatory (red), ${what}.`;
    el.map.setAttribute('aria-label', `${obs.name}, ${km(Math.hypot(...r))} from the Earth's centre, and ${what}.`);
  }

  function renderParallax() {
    if (!obs) return;
    const t = timeMs(), d = 10 ** Number(el.dist.value) * AU_KM, ra = Number(el.ra.value) * DEG, dec = Number(el.dec.value) * DEG;
    const dAu = d / AU_KM;
    el.distOut.textContent = `${dAu >= 0.1 ? dAu.toFixed(dAu >= 1 ? 1 : 2) : dAu.toPrecision(2)} au (${(d / MOON_KM).toFixed(d < 10 * MOON_KM ? 1 : 0)} × the Moon’s distance)`;
    el.raOut.textContent = `${(ra / DEG / 15).toFixed(1)} h (${Math.round(ra / DEG)}°)`;
    el.decOut.textContent = `${dec >= 0 ? '+' : '−'}${Math.abs(Math.round(dec / DEG))}°`;
    const span = obs.kind === 'ground' ? 86400000 : obs.code === '250' ? 2 * 3600000 : 182 * 86400000;
    const track = [];
    for (let k = -120; k <= 120; k++) { const tt = t + (k / 120) * span / 2, p = obs.pos(tt); if (p) track.push(skyOffset(p, d, ra, dec)); }
    const now = skyOffset(obs.pos(t), d, ra, dec);
    const { ctx, w, h } = fit(el.track);
    let ext = 1.15 * Math.max(...track.map((o) => Math.max(Math.abs(o[0]), Math.abs(o[1]))), 1e-3);
    let unit = '″', k = 1;
    if (ext > 2 * 3600) { unit = '°'; k = 1 / 3600; } else if (ext > 120) { unit = '′'; k = 1 / 60; }
    ext *= k;
    const asp = w / h;
    const f = frame(ctx, w, h, { x0: ext * asp * 0.9, x1: -ext * asp * 0.9, y0: -ext, y1: ext, xlabel: `shift in right ascension (${unit}, east to the left)`, ylabel: `shift in declination (${unit})`, left: 56 });
    f.clip();
    ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 1.5; ctx.beginPath();
    track.forEach((o, i) => { const X = f.X(o[0] * k), Y = f.Y(o[1] * k); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.moveTo(f.X(0) - 6, f.Y(0)); ctx.lineTo(f.X(0) + 6, f.Y(0)); ctx.moveTo(f.X(0), f.Y(0) - 6); ctx.lineTo(f.X(0), f.Y(0) + 6); ctx.stroke();
    dot(ctx, f.X(now[0] * k), f.Y(now[1] * k), 5, '#c4160c');
    ctx.restore();
    const shift = Math.hypot(...now), per1km = (1 / d) * AS;
    const window = obs.kind === 'ground' ? 'over the day' : obs.code === '250' ? 'over two hours' : 'over a year';
    el.read.textContent = `From ${obs.code}, the asteroid appears ${ang(shift)} from its geocentric position (the cross) at this moment; the curve shows the shift ${window}. `
      + `At this distance, an error of 1 km in the observatory’s position would move it by ${ang(per1km)}.`;
    el.track.setAttribute('aria-label', `Apparent shift of an asteroid at ${dAu.toPrecision(2)} au seen from ${obs.name}: ${ang(shift)} now.`);
  }

  async function init() {
    const [rows, sc] = await Promise.all([fetch(`${BASE}obscodes.json`).then((r) => r.json()), fetch(`${BASE}spacecraft.json`).then((r) => r.json())]);
    codes = new Map(rows.map((r) => [r[0], r])); craft = sc;
    const frag = document.createDocumentFragment();
    for (const [c, s] of Object.entries(craft)) { const o = document.createElement('option'); o.value = `${c} ${s.name}`; frag.append(o); }
    for (const r of rows) { const o = document.createElement('option'); o.value = `${r[0]} ${r[1]}`; frag.append(o); }
    el.list.append(frag);
    el.code.addEventListener('change', () => choose(el.code.value));
    el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') choose(el.code.value); });
    document.querySelectorAll('.wis-quick [data-code]').forEach((b) => b.addEventListener('click', () => { el.code.value = b.dataset.code; choose(b.dataset.code); }));
    el.time.addEventListener('input', () => { showError(''); render(); });
    for (const x of [el.dist, el.ra, el.dec]) x.addEventListener('input', renderParallax);
    el.opp.addEventListener('click', () => {
      const [sra, sdec] = sunRaDec(timeMs());
      el.ra.value = String(Math.round(((sra / DEG + 180) % 360 + 360) % 360)); el.dec.value = String(Math.round(-sdec / DEG));
      renderParallax();
    });
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
    choose(el.code.value);
  }
  init();
}
