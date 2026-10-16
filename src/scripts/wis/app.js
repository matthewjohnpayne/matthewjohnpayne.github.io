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

const PALETTE = ['#c4160c', '#1f6fb4', '#2b8a3e', '#8e44ad', '#d9730d', '#6b4f3a'];
const MAX_OBS = 6;
/** How long a track each kind of observatory gets: a day on the ground, two hours for Hubble,
 *  half a year either side for the distant spacecraft. */
const spanOf = (o) => (o.kind === 'ground' ? 86400000 : o.code === '250' ? 2 * 3600000 : 182 * 86400000);
const spanWords = (o) => (o.kind === 'ground' ? 'over the day' : o.code === '250' ? 'over two hours' : 'over a year');
const fmtRange = (o, full) => [0, 1].map((k) => new Date(o.range[k]).toISOString().slice(0, full ? 16 : 10).replace('T', ' ')).join(' to ');

export function startWis() {
  const $ = (id) => document.getElementById(id);
  const el = { code: $('wis-code'), add: $('wis-add'), list: $('wis-codes'), sel: $('wis-selected'), time: $('wis-time'), error: $('wis-error'), where: $('wis-where'), map: $('wis-map'), mapCap: $('wis-map-cap'),
    dist: $('wis-dist'), distOut: $('wis-dist-out'), ra: $('wis-ra'), raOut: $('wis-ra-out'), dec: $('wis-dec'), decOut: $('wis-dec-out'), opp: $('wis-opp'),
    track: $('wis-track'), read: $('wis-par-read') };
  let codes = new Map(), craft = {};
  /** The chosen observatories, in order of adding: {code, name, kind, pos(ms), range?, color}. */
  const chosen = [];

  const timeMs = () => { const v = el.time.value; const t = Date.parse(`${v}:00Z`); return Number.isFinite(t) ? t : Date.UTC(2026, 9, 13, 6); };
  const setTime = (ms) => { el.time.value = new Date(ms).toISOString().slice(0, 16); };
  function showError(m) { el.error.textContent = m; el.error.hidden = !m; }
  const inRange = (o, t) => !o.range || (t >= o.range[0] && t <= o.range[1]);

  /** An observatory from a code, or from part of its name. */
  function resolve(text) {
    const t = text.trim(), code = t.split(/\s+/)[0].toUpperCase();
    const pick = (c) => {
      if (craft[c]) return { code: c, name: craft[c].name, kind: 'space', pos: (ms) => craftJ2000(craft[c], ms), range: craftRange(craft[c]) };
      const r = codes.get(c);
      return r && { code: c, name: r[1], kind: 'ground', lon: r[2], rc: r[3], rs: r[4], pos: (ms) => stationJ2000(ms, r[2], r[3], r[4]) };
    };
    let o = pick(code);
    if (!o && t.length >= 3) {     // search by name
      const norm = (x) => x.toLowerCase().replace(/[\s-]+/g, ''), q = norm(t);   // "Mauna Kea" finds "Maunakea"
      const hit = [...codes.values()].find((r) => norm(r[1]).includes(q)) || Object.entries(craft).find(([, c]) => norm(c.name).includes(q))?.[0];
      if (hit) o = pick(Array.isArray(hit) ? hit[0] : hit);
    }
    return o;
  }

  function add(text, { quiet = false } = {}) {
    if (!text.trim()) return;
    const o = resolve(text);
    if (!o) { showError(`No observatory code or name matches “${text}”.`); return; }
    if (chosen.some((c) => c.code === o.code)) { if (!quiet) showError(`${o.code} ${o.name} is already shown.`); return; }
    if (chosen.length >= MAX_OBS) { showError(`Up to ${MAX_OBS} observatories can be shown at once; remove one first.`); return; }
    showError('');
    o.color = PALETTE.find((c) => !chosen.some((x) => x.color === c));
    chosen.push(o);
    const t = timeMs();
    if (!inRange(o, t)) {
      if (chosen.length === 1) { setTime(Math.min(Math.max(t, o.range[0] + 60000), o.range[1] - 60000)); showError(`${o.name} positions here cover ${fmtRange(o)}, so the time has been moved into that range.`); }
      else showError(`${o.name} positions here cover ${fmtRange(o, true)} UTC; it is left out of the plots at other times.`);
    }
    el.code.value = '';
    renderAll();
  }

  function remove(code) {
    const i = chosen.findIndex((c) => c.code === code);
    if (i >= 0) chosen.splice(i, 1);
    showError('');
    renderAll();
  }

  function renderChips() {
    el.sel.innerHTML = chosen.length ? chosen.map((o) => `<li><span class="wis-swatch" style="background:${o.color}" aria-hidden="true"></span>${esc(o.code)} ${esc(o.name)}`
      + `<button type="button" data-remove="${esc(o.code)}" aria-label="Remove ${esc(o.code)} ${esc(o.name)}">×</button></li>`).join('') : '<li>none: add an observatory above</li>';
    document.querySelectorAll('.wis-quick [data-code]').forEach((b) => b.setAttribute('aria-pressed', String(chosen.some((c) => c.code === b.dataset.code))));
  }

  function renderAll() {
    renderChips();
    const t = timeMs();
    const live = chosen.filter((o) => inRange(o, t));
    el.where.innerHTML = chosen.map((o) => card(o, t)).join('');
    drawMap(t, live);
    renderParallax();
  }

  /** A summary card for one observatory at time t. */
  function card(o, t) {
    const head = `<h3><span class="wis-swatch" style="background:${o.color}" aria-hidden="true"></span>${esc(o.code)} · ${esc(o.name)}</h3>`;
    if (!inRange(o, t)) return `<div class="wis-card off">${head}<p>Positions here cover ${esc(fmtRange(o, true))} UTC.</p></div>`;
    const r = o.pos(t), dist = Math.hypot(...r);
    const rows = [['Geocentric position (J2000)', `x ${km(r[0])}, y ${km(r[1])}, z ${km(r[2])}`], ['Distance from the Earth’s centre', `${km(dist)} = ${(dist / R_EARTH_KM).toFixed(dist < 2 * R_EARTH_KM ? 3 : 0)} Earth radii`],
      ['Light-travel time from the geocentre', dist / C_KM_S >= 1 ? `${(dist / C_KM_S).toFixed(2)} s` : `${(1000 * dist / C_KM_S).toFixed(1)} ms`]];
    if (o.kind === 'ground') {
      const latc = Math.atan2(o.rs, o.rc) / DEG, lon = o.lon > 180 ? o.lon - 360 : o.lon;
      rows.unshift(['Parallax constants', `longitude ${o.lon.toFixed(4)}°, ρ cos φ′ ${o.rc}, ρ sin φ′ ${o.rs}`],
        ['Location', `${Math.abs(latc).toFixed(2)}° ${latc >= 0 ? 'N' : 'S'} (geocentric), ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`]);
    } else rows.unshift(['Source', 'spacecraft position from wis (SPICE kernels)']);
    return `<div class="wis-card">${head}<dl class="mo-dl wis-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`;
  }

  /** The observatories around the Earth, seen from above the north celestial pole (J2000 x-y). */
  function drawMap(t, live) {
    const { ctx, w, h } = fit(el.map);
    const tracks = live.map((o) => {
      const span = spanOf(o), pts = [];
      for (let k = -100; k <= 100; k++) { const p = o.pos(t + (k / 100) * span / 2); if (p) pts.push(p); }
      return { o, pts, now: o.pos(t) };
    });
    const ext = 1.12 * Math.max(R_EARTH_KM * 1.15, ...tracks.flatMap((tr) => tr.pts.map((p) => Math.hypot(p[0], p[1]))));
    const s = (Math.min(w, h) / 2 - 14) / ext, cx = w / 2, cy = h / 2, P = (p) => [cx + p[0] * s, cy - p[1] * s];
    if (MOON_KM < ext) { ctx.strokeStyle = COLORS.axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, MOON_KM * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = '#cfe3ea'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(R_EARTH_KM * s, 3), 0, 2 * Math.PI); ctx.fill();
    for (const { o, pts, now } of tracks) {
      ctx.strokeStyle = o.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      const [X, Y] = P(now); dot(ctx, X, Y, 5, o.color);
    }
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${km(ext)} to edge`, 8, 8);
    const kinds = [];
    if (live.some((o) => o.kind === 'ground')) kinds.push('a ground station’s over 24 hours as the Earth turns');
    if (live.some((o) => o.code === '250')) kinds.push('Hubble’s over two hours');
    if (live.some((o) => o.kind === 'space' && o.code !== '250')) kinds.push('a distant spacecraft’s over half a year either side');
    el.mapCap.textContent = live.length
      ? `Seen from above the north celestial pole: each observatory now (dot) and its path (line): ${kinds.join('; ')}.${MOON_KM < ext ? ' The Moon’s orbit is dashed for scale.' : ''}${tracks.length > 1 && ext > 20 * R_EARTH_KM && live.some((o) => o.kind === 'ground') ? ' At this scale the ground stations sit on the Earth.' : ''}`
      : 'No observatory to show at this time.';
    el.map.setAttribute('aria-label', live.length ? `Positions around the Earth of ${live.map((o) => `${o.name}, ${km(Math.hypot(...o.pos(t)))} from the Earth's centre`).join('; ')}.` : 'No observatory to show.');
  }

  function renderParallax() {
    const t = timeMs(), d = 10 ** Number(el.dist.value) * AU_KM, ra = Number(el.ra.value) * DEG, dec = Number(el.dec.value) * DEG;
    const dAu = d / AU_KM;
    el.distOut.textContent = `${dAu >= 0.1 ? dAu.toFixed(dAu >= 1 ? 1 : 2) : dAu.toPrecision(2)} au (${(d / MOON_KM).toFixed(d < 10 * MOON_KM ? 1 : 0)} × the Moon’s distance)`;
    el.raOut.textContent = `${(ra / DEG / 15).toFixed(1)} h (${Math.round(ra / DEG)}°)`;
    el.decOut.textContent = `${dec >= 0 ? '+' : '−'}${Math.abs(Math.round(dec / DEG))}°`;
    const live = chosen.filter((o) => inRange(o, t));
    const curves = live.map((o) => {
      const span = spanOf(o), track = [];
      for (let k = -120; k <= 120; k++) { const p = o.pos(t + (k / 120) * span / 2); if (p) track.push(skyOffset(p, d, ra, dec)); }
      return { o, track, now: skyOffset(o.pos(t), d, ra, dec) };
    });
    const { ctx, w, h } = fit(el.track);
    let ext = 1.15 * Math.max(1e-3, ...curves.flatMap((c) => c.track.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1])))));
    let unit = '″', k = 1;
    if (ext > 2 * 3600) { unit = '°'; k = 1 / 3600; } else if (ext > 120) { unit = '′'; k = 1 / 60; }
    ext *= k;
    const asp = w / h;
    const f = frame(ctx, w, h, { x0: ext * asp * 0.9, x1: -ext * asp * 0.9, y0: -ext, y1: ext, xlabel: `shift in right ascension (${unit}, east to the left)`, ylabel: `shift in declination (${unit})`, left: 56 });
    f.clip();
    for (const { o, track, now } of curves) {
      ctx.strokeStyle = o.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.beginPath();
      track.forEach((v, i) => { const X = f.X(v[0] * k), Y = f.Y(v[1] * k); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      dot(ctx, f.X(now[0] * k), f.Y(now[1] * k), 5, o.color);
    }
    ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.moveTo(f.X(0) - 6, f.Y(0)); ctx.lineTo(f.X(0) + 6, f.Y(0)); ctx.moveTo(f.X(0), f.Y(0) - 6); ctx.lineTo(f.X(0), f.Y(0) + 6); ctx.stroke();
    ctx.restore();
    if (!curves.length) { el.read.textContent = 'Add an observatory to see the shift.'; el.track.setAttribute('aria-label', 'No observatory selected.'); return; }
    const per1km = (1 / d) * AS;
    const each = curves.map(({ o, now }) => `${o.code} ${ang(Math.hypot(...now))}`).join(', ');
    let pair = '';
    if (curves.length >= 2) {
      let best = null;
      for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
        const sep = Math.hypot(curves[i].now[0] - curves[j].now[0], curves[i].now[1] - curves[j].now[1]);
        if (!best || sep > best.sep) best = { sep, a: curves[i].o.code, b: curves[j].o.code };
      }
      pair = ` The largest difference between two of them, ${best.a} and ${best.b}, is ${ang(best.sep)}.`;
    }
    const windows = [...new Set(curves.map(({ o }) => spanWords(o)))].join(' or ');
    el.read.textContent = `The asteroid appears this far from its geocentric position (the cross) at this moment: ${each}.${pair} Each curve shows the shift ${windows}. `
      + `At this distance, an error of 1 km in an observatory’s position would move the asteroid by ${ang(per1km)}.`;
    el.track.setAttribute('aria-label', `Apparent shift of an asteroid at ${dAu.toPrecision(2)} au: ${curves.map(({ o, now }) => `${ang(Math.hypot(...now))} from ${o.name}`).join('; ')}.`);
  }

  async function init() {
    const [rows, sc] = await Promise.all([fetch(`${BASE}obscodes.json`).then((r) => r.json()), fetch(`${BASE}spacecraft.json`).then((r) => r.json())]);
    codes = new Map(rows.map((r) => [r[0], r])); craft = sc;
    const frag = document.createDocumentFragment();
    for (const [c, s] of Object.entries(craft)) { const o = document.createElement('option'); o.value = `${c} ${s.name}`; frag.append(o); }
    for (const r of rows) { const o = document.createElement('option'); o.value = `${r[0]} ${r[1]}`; frag.append(o); }
    el.list.append(frag);
    el.add.addEventListener('click', () => add(el.code.value));
    el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(el.code.value); } });
    // picking a suggestion from the list adds it straight away
    el.code.addEventListener('input', (e) => { if (e.inputType === 'insertReplacementText' || e.inputType == null) { const v = el.code.value; if (resolve(v) && [...el.list.options].some((o) => o.value === v)) add(v, { quiet: true }); } });
    el.sel.addEventListener('click', (e) => { const b = e.target.closest('[data-remove]'); if (b) remove(b.dataset.remove); });
    document.querySelectorAll('.wis-quick [data-code]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.code;
      if (chosen.some((o) => o.code === c)) remove(c); else add(c);
    }));
    el.time.addEventListener('input', () => { showError(''); renderAll(); });
    for (const x of [el.dist, el.ra, el.dec]) x.addEventListener('input', renderParallax);
    el.opp.addEventListener('click', () => {
      const [sra, sdec] = sunRaDec(timeMs());
      el.ra.value = String(Math.round(((sra / DEG + 180) % 360 + 360) % 360)); el.dec.value = String(Math.round(-sdec / DEG));
      renderParallax();
    });
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); });
    add('X05');
  }
  init();
}
