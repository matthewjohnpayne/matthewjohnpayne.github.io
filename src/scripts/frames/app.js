// Interactive reference-frames page: runs the integration in a worker, then
// draws the stored trajectory in whichever frame and around whichever planet
// the reader selects.
import { buildFrames } from './frames.js';

const YEARS = 300;
const DT = 0.5;          // days; validated against REBOUND IAS15 (see page text)
const SAMPLE_DAYS = 2;
const AU_RSUN = 215.032; // solar radii per AU

const COLORS = {
  grid: '#e7eff1', axis: '#cfdde2', text: '#5b6f7c', lagrange: '#8a9ba6',
  planet: '#3f6f8f', sun: '#e9a160', sunEdge: '#c97f3c'
};

// Each planet: its companions, Hill radius (AU), default controls and per-frame
// view (centre and half-width in AU, plus overlays).
const PLANETS = {
  earth: {
    name: 'Earth',
    targets: [{ key: 'kamooalewa', name: 'Kamoʻoalewa', color: '#078d97' }],
    hill: 0.0100,
    trail: 10, speed: 1,
    views: {
      barycentric: { cx: 0, cy: 0, hw: 1.35, label: 'Barycentric ecliptic x, y (AU)', sunInset: true, sun: true },
      heliocentric: { cx: 0, cy: 0, hw: 1.35, label: 'Heliocentric ecliptic x, y (AU)', sun: true },
      planetocentric: { cx: 0, cy: 0, hw: 0.42, label: 'Geocentric, non-rotating x, y (AU)', hill: true },
      corotating: { cx: 1, cy: 0, hw: 0.42, label: 'Heliocentric, rotating with Earth (AU)', sunArrow: true },
      synodic: { cx: 1, cy: 0, hw: 0.42, label: 'Heliocentric, rotating at Earth’s mean motion (AU)', sunArrow: true }
    }
  },
  jupiter: {
    name: 'Jupiter',
    targets: [
      { key: 'hektor', name: 'Hektor', color: '#7a52c7' },
      { key: 'hilda', name: 'Hilda', color: '#2e8b57' }
    ],
    hill: 0.355,
    trail: 50, speed: 5,
    views: {
      barycentric: { cx: 0, cy: 0, hw: 6.6, label: 'Barycentric ecliptic x, y (AU)', sunInset: true, sun: true },
      heliocentric: { cx: 0, cy: 0, hw: 6.6, label: 'Heliocentric ecliptic x, y (AU)', sun: true },
      planetocentric: { cx: 0, cy: 0, hw: 10.5, label: 'Jupiter-centred, non-rotating x, y (AU)', hill: true },
      corotating: { cx: 0, cy: 0, hw: 6.6, label: 'Heliocentric, rotating with Jupiter (AU)', sun: true, lagrange: true },
      synodic: { cx: 0, cy: 0, hw: 6.6, label: 'Heliocentric, rotating at Jupiter’s mean motion (AU)', sun: true, lagrange: true }
    }
  }
};
const FRAMES = ['barycentric', 'heliocentric', 'planetocentric', 'corotating', 'synodic'];

export function startReferenceFrames(ic) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('rf-canvas');
  const ctx = canvas.getContext('2d');
  const status = $('rf-status');
  const play = $('rf-play'), slider = $('rf-time'), dateOut = $('rf-date');
  const trailSel = $('rf-trail'), speedSel = $('rf-speed');
  const readout = [1, 2, 3].map((n) => ({ dt: $(`rf-r${n}-label`), dd: $(`rf-r${n}`) }));
  const frameRadios = [...document.querySelectorAll('input[name="rf-frame"]')];
  const planetRadios = [...document.querySelectorAll('input[name="rf-planet"]')];
  const explains = [...document.querySelectorAll('.rf-explain')];
  const epochMs = Date.UTC(1858, 10, 17) + ic.epochMJD_TT * 86400000;

  let data = null, frames = null, planet = 'earth', frame = 'corotating';
  let index = 0, playing = false, last = 0, carry = 0, meanDistance = {};

  // --- integration -------------------------------------------------------
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: result }) => {
    data = result;
    frames = {};
    for (const [key, p] of Object.entries(PLANETS)) {
      frames[key] = buildFrames({
        t: result.t, sun: result.xy.sun, planet: result.xy[key],
        targets: Object.fromEntries(p.targets.map((t) => [t.key, result.xy[t.key]]))
      }).frames;
      const h = frames[key].heliocentric.planet;
      let sum = 0; for (let k = 0; k < result.t.length; k++) sum += Math.hypot(h[2 * k], h[2 * k + 1]);
      meanDistance[key] = sum / result.t.length;
    }
    worker.terminate();
    index = Math.round((PLANETS[planet].trail * 365.25) / SAMPLE_DAYS); // open with a trail already drawn
    slider.max = String(result.t.length - 1);
    slider.value = String(index);
    slider.disabled = false; play.disabled = false;
    const names = ic.particles.map((p) => p.name);
    status.textContent = `Integrated ${YEARS} years of the Sun, planets, Moon, ${names.slice(0, -1).join(', ')} and ${names.at(-1)} in your browser in ${(result.ms / 1000).toFixed(2)} s.`;
    status.classList.add('is-done');
    draw();
  };
  worker.onerror = () => { status.textContent = 'Sorry, the integration could not run in this browser.'; };
  worker.postMessage({ ic, years: YEARS, dt: DT, sampleDays: SAMPLE_DAYS });

  // --- controls ----------------------------------------------------------
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    return { p: PLANETS[h.get('planet')] ? h.get('planet') : 'earth', f: FRAMES.includes(h.get('frame')) ? h.get('frame') : null };
  }
  function writeHash() {
    history.replaceState(null, '', `#${planet === 'earth' ? '' : `planet=${planet}&`}frame=${frame}`);
  }

  function setView(p, f, updateHash = true) {
    const planetChanged = p !== planet;
    planet = p; frame = f;
    const cfg = PLANETS[p];
    frameRadios.forEach((r) => { r.checked = r.value === f; });
    planetRadios.forEach((r) => { r.checked = r.value === p; });
    explains.forEach((e) => { e.hidden = e.dataset.frame !== f || e.dataset.planet !== p; });
    document.querySelectorAll('.rf-pname').forEach((el) => { el.textContent = cfg.name; });
    if (planetChanged) {
      trailSel.value = String(cfg.trail);
      speedSel.value = String(cfg.speed);
      // Make sure a full default trail is on screen.
      const minIndex = Math.round((cfg.trail * 365.25) / SAMPLE_DAYS);
      if (data && index < minIndex) { index = minIndex; slider.value = String(index); }
    }
    setReadoutLabels();
    const frameName = frameRadios.find((r) => r.value === f)?.closest('label')?.querySelector('strong')?.textContent;
    canvas.setAttribute('aria-label', `Trajectories of ${cfg.targets.map((t) => t.name).join(' and ')} in the ${frameName} frame`);
    if (updateHash) writeHash();
    draw();
  }

  function setReadoutLabels() {
    const cfg = PLANETS[planet], first = cfg.targets[0].name;
    const labels = planet === 'earth'
      ? [`${cfg.name}–${first} distance`, 'Longitude ahead of Earth', 'Turns around Earth during the trail']
      : [`${first}–${cfg.name} distance`, `${first} longitude ahead of ${cfg.name}`, `Hilda orbits per ${cfg.name} orbit, over the trail`];
    readout.forEach((r, i) => { r.dt.textContent = labels[i]; });
  }

  frameRadios.forEach((r) => r.addEventListener('change', () => setView(planet, r.value)));
  planetRadios.forEach((r) => r.addEventListener('change', () => setView(r.value, frame)));
  window.addEventListener('hashchange', () => {
    const { p, f } = readHash();
    if (p !== planet || (f && f !== frame)) setView(p, f || frame, false);
  });
  document.querySelectorAll('[data-show-frame]').forEach((b) => b.addEventListener('click', () => {
    setView(b.dataset.showPlanet || planet, b.dataset.showFrame);
    $('rf-lab').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  slider.addEventListener('input', () => { index = Number(slider.value); draw(); });
  trailSel.addEventListener('change', draw);
  play.addEventListener('click', () => {
    if (!data) return;
    if (!playing && index >= data.t.length - 1) index = 0;
    playing = !playing;
    play.setAttribute('aria-pressed', String(playing));
    play.textContent = playing ? '❚❚ Pause' : '▶ Play';
    if (playing) { last = performance.now(); carry = 0; requestAnimationFrame(tick); }
  });
  function tick(now) {
    if (!playing) return;
    const samplesPerSec = (Number(speedSel.value) * 365.25) / SAMPLE_DAYS;
    carry += ((now - last) / 1000) * samplesPerSec;
    last = now;
    const step = Math.floor(carry);
    carry -= step;
    index = Math.min(index + step, data.t.length - 1);
    slider.value = String(index);
    draw();
    if (index >= data.t.length - 1) play.click();
    else requestAnimationFrame(tick);
  }
  new ResizeObserver(() => draw()).observe(canvas.parentElement);

  const initial = readHash();
  setView(initial.p, initial.f || frame, false);

  // --- drawing -----------------------------------------------------------
  function draw() {
    const stage = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cfg = PLANETS[planet];
    const view = cfg.views[frame];
    const scale = Math.min(w, h) / (2 * view.hw);
    const X = (x) => w / 2 + (x - view.cx) * scale;
    const Y = (y) => h / 2 - (y - view.cy) * scale;

    drawGrid(w, h, view, scale, X, Y);
    if (view.hill) drawHill(X, Y, scale, cfg);
    if (view.sunArrow) drawSunArrow(h);
    if (view.lagrange && frames) drawLagrange(X, Y, scale, meanDistance[planet]);
    if (!frames) return;

    const f = frames[planet][frame];
    const trailYears = Number(trailSel.value);
    const start = Math.max(0, index - Math.round((trailYears * 365.25) / SAMPLE_DAYS));
    if (frame !== 'planetocentric') drawTrail(f.planet, start, index, COLORS.planet, 1.1, X, Y);
    for (const t of cfg.targets) drawTrail(f[t.key], start, index, t.color, cfg.targets.length > 1 ? 1.2 : 1.7, X, Y);
    if (view.sun) drawSun(X(f.sun[2 * index]), Y(f.sun[2 * index + 1]), 7);
    drawBody(X(f.planet[2 * index]), Y(f.planet[2 * index + 1]), 5.5, COLORS.planet, cfg.name);
    for (const t of cfg.targets) drawBody(X(f[t.key][2 * index]), Y(f[t.key][2 * index + 1]), 4.5, t.color, t.name);
    if (view.sunInset) drawSunInset(w, h, start);

    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(view.label, 12, h - 12);
    updateReadout(f, start);
  }

  function drawGrid(w, h, view, scale, X, Y) {
    const step = view.hw > 3 ? 1 : view.hw > 1 ? 0.5 : 0.1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let g = Math.ceil((view.cx - w / 2 / scale) / step) * step; g <= view.cx + w / 2 / scale; g += step) { ctx.moveTo(X(g), 0); ctx.lineTo(X(g), h); }
    for (let g = Math.ceil((view.cy - h / 2 / scale) / step) * step; g <= view.cy + h / 2 / scale; g += step) { ctx.moveTo(0, Y(g)); ctx.lineTo(w, Y(g)); }
    ctx.stroke();
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath(); ctx.moveTo(X(view.cx), 0); ctx.lineTo(X(view.cx), h); ctx.moveTo(0, Y(view.cy)); ctx.lineTo(w, Y(view.cy)); ctx.stroke();
    // Scale bar
    const px = step * scale;
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(w - 14 - px, h - 16); ctx.lineTo(w - 14, h - 16); ctx.stroke();
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${step} AU`, w - 14 - px / 2, h - 22);
  }

  function drawHill(X, Y, scale, cfg) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = COLORS.planet; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(0), Y(0), Math.max(cfg.hill * scale, 3), 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${cfg.name}’s Hill sphere`, X(0) + Math.max(cfg.hill * scale, 3) + 6, Y(0) + 16);
  }

  function drawSunArrow(h) {
    ctx.fillStyle = COLORS.sunEdge; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('← Sun, 1 AU this way', 12, h / 2 - 8);
  }

  // Lagrange points L3, L4, L5 on a circle at the planet's mean distance.
  function drawLagrange(X, Y, scale, a) {
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(X(0), Y(0), a * scale, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.lagrange; ctx.fillStyle = COLORS.lagrange; ctx.lineWidth = 1.2;
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    for (const [deg, name] of [[60, 'L4'], [180, 'L3'], [-60, 'L5']]) {
      const x = X(a * Math.cos((deg * Math.PI) / 180)), y = Y(a * Math.sin((deg * Math.PI) / 180));
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      ctx.fillText(name, x + 7, y - 6);
    }
  }

  function drawTrail(xy, start, end, color, width, X, Y) {
    const n = end - start;
    if (n < 1) return;
    const stride = Math.max(1, Math.floor(n / 6000));
    const chunks = 24;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
    for (let c = 0; c < chunks; c++) {
      const a = start + Math.floor((n * c) / chunks), b = start + Math.floor((n * (c + 1)) / chunks);
      if (b <= a) continue;
      ctx.globalAlpha = 0.1 + (0.9 * (c + 1)) / chunks;
      ctx.beginPath(); ctx.moveTo(X(xy[2 * a]), Y(xy[2 * a + 1]));
      for (let k = a + stride; k < b; k += stride) ctx.lineTo(X(xy[2 * k]), Y(xy[2 * k + 1]));
      ctx.lineTo(X(xy[2 * b]), Y(xy[2 * b + 1]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBody(x, y, r, color, label) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(label, x + r + 6, y - r - 3);
    ctx.fillText(label, x + r + 6, y - r - 3);
  }

  function drawSun(x, y, r) {
    ctx.fillStyle = COLORS.sun; ctx.strokeStyle = COLORS.sunEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }

  function drawSunInset(w, h, start) {
    // The Sun's barycentric path in solar radii, with its disk to scale.
    const size = Math.min(w, h) * (planet === 'earth' ? 0.3 : 0.24), x0 = 12, y0 = 12, half = 3; // ±3 solar radii
    const s = size / (2 * half), cx = x0 + size / 2, cy = y0 + size / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, size, size); ctx.strokeRect(x0, y0, size, size);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
    const sun = data.xy.sun, from = Math.max(start, index - Math.round((60 * 365.25) / SAMPLE_DAYS));
    ctx.strokeStyle = COLORS.sunEdge; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
    for (let k = from; k <= index; k += 2) {
      const px = cx + sun[2 * k] * AU_RSUN * s, py = cy - sun[2 * k + 1] * AU_RSUN * s;
      if (k === from) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(233,161,96,0.55)'; ctx.strokeStyle = COLORS.sunEdge;
    ctx.beginPath(); ctx.arc(cx + sun[2 * index] * AU_RSUN * s, cy - sun[2 * index + 1] * AU_RSUN * s, s, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLORS.text; ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.text; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('The Sun around the barycentre (+)', x0 + 7, y0 + 15);
    ctx.fillText('to scale, ±3 solar radii', x0 + 7, y0 + size - 8);
  }

  // Net turns of a direction (from a, or the origin, to b) between samples start and end.
  function turns(bxy, start, end, axy = null) {
    let tot = 0, prev = null;
    for (let k = start; k <= end; k++) {
      const ang = Math.atan2(bxy[2 * k + 1] - (axy ? axy[2 * k + 1] : 0), bxy[2 * k] - (axy ? axy[2 * k] : 0));
      if (prev !== null) { let s = ang - prev; if (s > Math.PI) s -= 2 * Math.PI; else if (s < -Math.PI) s += 2 * Math.PI; tot += s; }
      prev = ang;
    }
    return tot / (2 * Math.PI);
  }

  function updateReadout(f, start) {
    const cfg = PLANETS[planet], first = cfg.targets[0].key;
    const hel = frames[planet].heliocentric, i = 2 * index;
    const p = hel.planet, a = hel[first];
    readout[0].dd.textContent = `${Math.hypot(a[i] - p[i], a[i + 1] - p[i + 1]).toFixed(planet === 'earth' ? 3 : 2)} AU`;
    let d = ((Math.atan2(a[i + 1], a[i]) - Math.atan2(p[i + 1], p[i])) * 180) / Math.PI;
    d = ((d + 540) % 360) - 180;
    readout[1].dd.textContent = `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}°`;
    if (planet === 'earth') {
      // Net turns of the Earth→Kamoʻoalewa direction across the trail, in this frame's axes
      const n = turns(f[first], start, index, f.planet);
      readout[2].dd.textContent = `${n < -0.05 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
    } else {
      // Ratio of heliocentric revolutions across the trail: 1.5 for the 3:2 resonance
      const pj = turns(hel.planet, start, index);
      readout[2].dd.textContent = pj < 1 ? 'Needs a longer trail' : (turns(hel.hilda, start, index) / pj).toFixed(2);
    }
    dateOut.textContent = new Date(epochMs + data.t[index] * 86400000).toISOString().slice(0, 10);
  }
}
