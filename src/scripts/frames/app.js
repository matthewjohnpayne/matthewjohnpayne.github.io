// Interactive reference-frames page: runs the integration in a worker, then
// draws the stored trajectory in whichever frame the reader selects.
import { buildFrames } from './frames.js';

const YEARS = 300;
const DT = 0.5;          // days; validated against REBOUND IAS15 (see page text)
const SAMPLE_DAYS = 2;
const AU_RSUN = 215.032; // solar radii per AU
const HILL_EARTH = 0.0100;

const COLORS = {
  grid: '#e7eff1', axis: '#cfdde2', text: '#5b6f7c',
  target: '#078d97', earth: '#3f6f8f', sun: '#e9a160', sunEdge: '#c97f3c'
};

// Per-frame view: centre and half-width in AU, plus overlays.
const VIEWS = {
  barycentric: { cx: 0, cy: 0, hw: 1.35, label: 'Barycentric ecliptic x, y (AU)', sunInset: true },
  heliocentric: { cx: 0, cy: 0, hw: 1.35, label: 'Heliocentric ecliptic x, y (AU)' },
  planetocentric: { cx: 0, cy: 0, hw: 0.42, label: 'Geocentric, non-rotating x, y (AU)', hill: true },
  corotating: { cx: 1, cy: 0, hw: 0.42, label: 'Heliocentric, rotating with Earth (AU)', sunArrow: true },
  synodic: { cx: 1, cy: 0, hw: 0.42, label: 'Heliocentric, rotating at Earth’s mean motion (AU)', sunArrow: true }
};

export function startReferenceFrames(ic) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('rf-canvas');
  const ctx = canvas.getContext('2d');
  const status = $('rf-status');
  const play = $('rf-play'), slider = $('rf-time'), dateOut = $('rf-date');
  const trailSel = $('rf-trail'), speedSel = $('rf-speed');
  const distOut = $('rf-dist'), dlamOut = $('rf-dlam'), windOut = $('rf-wind');
  const radios = [...document.querySelectorAll('input[name="rf-frame"]')];
  const explains = [...document.querySelectorAll('.rf-explain')];
  const epochMs = Date.UTC(1858, 10, 17) + ic.epochMJD_TT * 86400000;

  let data = null, frames = null, frame = 'corotating', index = 0, playing = false, last = 0, carry = 0;

  const initial = new URLSearchParams(location.hash.slice(1)).get('frame');
  if (initial && VIEWS[initial]) setFrame(initial, false);

  // --- integration -------------------------------------------------------
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: result }) => {
    data = result;
    frames = buildFrames({ t: result.t, sun: result.sun, planet: result.earth, target: result.target }).frames;
    worker.terminate();
    index = Math.round((10 * 365.25) / SAMPLE_DAYS); // open with a 10-year trail already drawn
    slider.max = String(result.t.length - 1);
    slider.value = String(index);
    slider.disabled = false; play.disabled = false;
    status.textContent = `Integrated ${YEARS} years of the Sun, planets, Moon and Kamoʻoalewa in your browser in ${(result.ms / 1000).toFixed(2)} s.`;
    status.classList.add('is-done');
    draw();
  };
  worker.onerror = () => { status.textContent = 'Sorry, the integration could not run in this browser.'; };
  worker.postMessage({ ic, years: YEARS, dt: DT, sampleDays: SAMPLE_DAYS });

  // --- controls ----------------------------------------------------------
  function setFrame(id, updateHash = true) {
    frame = id;
    radios.forEach((r) => { r.checked = r.value === id; });
    explains.forEach((e) => { e.hidden = e.dataset.frame !== id; });
    canvas.setAttribute('aria-label', `Trajectory of Kamoʻoalewa in the ${radios.find((r) => r.value === id)?.closest('label')?.querySelector('strong')?.textContent} frame`);
    if (updateHash) history.replaceState(null, '', `#frame=${id}`);
    draw();
  }
  radios.forEach((r) => r.addEventListener('change', () => setFrame(r.value)));
  window.addEventListener('hashchange', () => {
    const id = new URLSearchParams(location.hash.slice(1)).get('frame');
    if (id && VIEWS[id] && id !== frame) setFrame(id, false);
  });
  document.querySelectorAll('[data-show-frame]').forEach((b) => b.addEventListener('click', () => {
    setFrame(b.dataset.showFrame);
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
    const view = VIEWS[frame];
    const scale = Math.min(w, h) / (2 * view.hw);
    const X = (x) => w / 2 + (x - view.cx) * scale;
    const Y = (y) => h / 2 - (y - view.cy) * scale;

    drawGrid(w, h, view, scale, X, Y);
    if (view.hill) drawHill(X, Y, scale);
    if (view.sunArrow) drawSunArrow(h, view);
    if (!frames) return;

    const f = frames[frame];
    const trailYears = Number(trailSel.value);
    const start = Math.max(0, index - Math.round((trailYears * 365.25) / SAMPLE_DAYS));
    if (frame !== 'planetocentric') drawTrail(f.planet, start, index, COLORS.earth, 1.1, X, Y);
    drawTrail(f.target, start, index, COLORS.target, 1.7, X, Y);
    if (frame === 'barycentric' || frame === 'heliocentric') drawSun(X(f.sun[2 * index]), Y(f.sun[2 * index + 1]), 7);
    drawBody(X(f.planet[2 * index]), Y(f.planet[2 * index + 1]), 5.5, COLORS.earth, 'Earth');
    drawBody(X(f.target[2 * index]), Y(f.target[2 * index + 1]), 4.5, COLORS.target, 'Kamoʻoalewa');
    if (view.sunInset) drawSunInset(w, h, start);

    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(view.label, 12, h - 12);
    updateReadout(f, start);
  }

  function drawGrid(w, h, view, scale, X, Y) {
    const step = view.hw > 1 ? 0.5 : 0.1;
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

  function drawHill(X, Y, scale) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = COLORS.earth; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(0), Y(0), Math.max(HILL_EARTH * scale, 3), 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Earth’s Hill sphere', X(0) + HILL_EARTH * scale + 6, Y(0) + 16);
  }

  function drawSunArrow(h) {
    ctx.fillStyle = COLORS.sunEdge; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('← Sun, 1 AU this way', 12, h / 2 - 8);
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
    const size = Math.min(w, h) * 0.3, x0 = 12, y0 = 12, half = 3; // ±3 solar radii
    const s = size / (2 * half), cx = x0 + size / 2, cy = y0 + size / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, size, size); ctx.strokeRect(x0, y0, size, size);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
    const sun = data.sun, from = Math.max(start, index - Math.round((60 * 365.25) / SAMPLE_DAYS));
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

  function updateReadout(f, start) {
    const i = 2 * index;
    const dx = data.target[i] - data.earth[i], dy = data.target[i + 1] - data.earth[i + 1];
    distOut.textContent = `${Math.hypot(dx, dy).toFixed(3)} AU`;
    const lt = Math.atan2(data.target[i + 1] - data.sun[i + 1], data.target[i] - data.sun[i]);
    const le = Math.atan2(data.earth[i + 1] - data.sun[i + 1], data.earth[i] - data.sun[i]);
    let d = ((lt - le) * 180) / Math.PI; d = ((d + 540) % 360) - 180;
    dlamOut.textContent = `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}°`;
    // Net turns of the Earth→Kamoʻoalewa direction across the trail, in this frame's axes
    let turns = 0, prev = null;
    for (let k = start; k <= index; k++) {
      const a = Math.atan2(f.target[2 * k + 1] - f.planet[2 * k + 1], f.target[2 * k] - f.planet[2 * k]);
      if (prev !== null) { let s = a - prev; if (s > Math.PI) s -= 2 * Math.PI; else if (s < -Math.PI) s += 2 * Math.PI; turns += s; }
      prev = a;
    }
    turns /= 2 * Math.PI;
    windOut.textContent = `${turns < -0.05 ? '−' : ''}${Math.abs(turns).toFixed(1)}`;
    dateOut.textContent = new Date(epochMs + data.t[index] * 86400000).toISOString().slice(0, 10);
  }
}
