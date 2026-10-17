// The asteroid-belt orbit map (src/pages/teaching/asteroid-belt.astro): about 105,000 MPCORB orbits
// drawn as dots at their two-body positions, with a time slider, a frame that turns with Jupiter,
// and a morph to the (semi-major axis, eccentricity) plane where the Kirkwood gaps show.
// Nothing moves until the reader presses Play or a button.
import { decodeBelt, positions, planet, RESONANCES, resonanceA } from './kepler.js';

const SPACE_R = 5.9;                     // au from the Sun to the edge of the space view
const AE = { a0: 1.75, a1: 5.65, e1: 0.42 };
const BG = [11, 25, 38];                 // #0b1926
const COLOURS = [[79, 206, 210], [214, 243, 246], [233, 161, 96]];   // other, Hilda band, Trojan band
const GAIN = [0.3, 0.75, 0.8];
const T_MIN = -50, T_MAX = 50;

export function startOrbitMap(meta, root) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('om-canvas'), ctx = canvas.getContext('2d');
  const ui = {
    time: $('om-time'), timeOut: $('om-time-out'), play: $('om-play'), reset: $('om-reset'), speed: $('om-speed'),
    frame: [...document.querySelectorAll('input[name="om-frame"]')], morph: $('om-morph'), morphOut: $('om-morph-out'),
    show: [$('om-show-0'), $('om-show-1'), $('om-show-2')], status: $('om-status'), live: $('om-live'), load: $('om-load')
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const epochYear = (() => { const [y, m, d] = meta.epoch.split('-').map(Number); return y + (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 3.15576e10; })();
  const planets = ['mercury', 'venus', 'earth', 'mars', 'jupiter'].map((k) => planet(meta.planets[k]));
  const jupiter = planets[4];
  const paths = planets.map((p) => p.path(240));
  const state = { t: 0, rotating: false, s: 0, show: [true, true, true], playing: false };
  let orbits = null, pos = null, posT = NaN, W = 0, H = 0, dpr = 1, img = null, buf32 = null, target = null;

  // ---------------------------------------------------------------- geometry
  function resize() {
    const css = canvas.getBoundingClientRect().width;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = H = Math.max(200, Math.round(css * dpr));
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H);
    buf32 = new Uint32Array(img.data.buffer);
    target = null;
    draw();
  }
  const scale = () => (W / 2 - 6 * dpr) / SPACE_R;
  const aeBox = () => ({ x0: 46 * dpr, x1: W - 14 * dpr, y0: 18 * dpr, y1: H - 40 * dpr });
  function targets() {     // pixel position of every orbit in the (a, e) plane
    const b = aeBox(), out = new Float32Array(2 * orbits.N);
    for (let j = 0; j < orbits.N; j++) {
      out[2 * j] = b.x0 + ((orbits.a[j] - AE.a0) / (AE.a1 - AE.a0)) * (b.x1 - b.x0);
      out[2 * j + 1] = b.y1 - (orbits.e[j] / AE.e1) * (b.y1 - b.y0);
    }
    return out;
  }
  const ease = (u) => u * u * (3 - 2 * u);
  const angle = () => (state.rotating ? -(jupiter.meanLongitude(state.t) - jupiter.meanLongitude(0)) : 0);

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!img) return;
    const bg = (255 << 24) | (BG[2] << 16) | (BG[1] << 8) | BG[0];
    buf32.fill(bg);
    const data = img.data;
    const s = ease(state.s), k = scale(), cx = W / 2, cy = H / 2;
    const ang = angle(), c = Math.cos(ang), sn = Math.sin(ang);
    if (orbits) {
      if (posT !== state.t) { positions(orbits, state.t, pos); posT = state.t; }
      if (s > 0 && !target) target = targets();
      const size = dpr >= 1.5 ? 2 : 1;
      for (let j = 0; j < orbits.N; j++) {
        const cl = orbits.cls[j];
        if (!state.show[cl]) continue;
        const x = pos[2 * j], y = pos[2 * j + 1];
        let px = cx + k * (c * x - sn * y), py = cy - k * (sn * x + c * y);
        if (s > 0) { px += (target[2 * j] - px) * s; py += (target[2 * j + 1] - py) * s; }
        const ix = px | 0, iy = py | 0;
        if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue;
        const col = COLOURS[cl], g = GAIN[cl];
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
          const q = 4 * ((iy + dy) * W + ix + dx);
          data[q] += col[0] * g; data[q + 1] += col[1] * g; data[q + 2] += col[2] * g;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    overlays(s, k, cx, cy, c, sn);
  }

  function overlays(s, k, cx, cy, c, sn) {
    const P = (x, y) => [cx + k * (c * x - sn * y), cy - k * (sn * x + c * y)];
    ctx.save();
    ctx.font = `${12 * dpr}px system-ui, sans-serif`;
    if (s < 1) {                               // planets and their orbits, fading out with the morph
      ctx.globalAlpha = 1 - s;
      ctx.lineWidth = 1 * dpr;
      paths.forEach((path, i) => {
        ctx.strokeStyle = i === 4 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        path.forEach(([x, y], j) => { const [px, py] = P(x, y); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
      });
      ctx.fillStyle = '#fff';
      planets.forEach((p, i) => {
        const [px, py] = P(...p.position(state.t));
        ctx.beginPath(); ctx.arc(px, py, (i === 4 ? 4.5 : 2.6) * dpr, 0, 2 * Math.PI); ctx.fill();
        if (i === 4) ctx.fillText('Jupiter', px + 8 * dpr, py - 6 * dpr);
      });
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(cx, cy, 4.5 * dpr, 0, 2 * Math.PI); ctx.fill();
      if (state.rotating) {                    // Lagrange points 60 deg ahead of and behind Jupiter
        const lam = jupiter.meanLongitude(state.t), r = meta.planets.jupiter.a + 0.75;   // just outside the clouds
        ctx.font = `600 ${13 * dpr}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(11,25,38,0.9)'; ctx.fillStyle = '#fff';
        [['L4', 1], ['L5', -1]].forEach(([name, sgn]) => {
          const [px, py] = P(r * Math.cos(lam + sgn * Math.PI / 3), r * Math.sin(lam + sgn * Math.PI / 3));
          const qx = Math.min(W - 16 * dpr, Math.max(16 * dpr, px)), qy = Math.min(H - 10 * dpr, Math.max(18 * dpr, py + 4 * dpr));
          ctx.strokeText(name, qx, qy); ctx.fillText(name, qx, qy);
        });
        ctx.textAlign = 'start';
      }
    }
    if (s > 0) {                               // axes and resonances of the (a, e) plane
      const b = aeBox(), X = (a) => b.x0 + ((a - AE.a0) / (AE.a1 - AE.a0)) * (b.x1 - b.x0), Y = (e) => b.y1 - (e / AE.e1) * (b.y1 - b.y0);
      ctx.globalAlpha = s;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x0, b.y1); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.textAlign = 'center';
      for (let a = 2; a <= 5; a++) { ctx.fillText(`${a}`, X(a), b.y1 + 15 * dpr); }
      ctx.fillText('semi-major axis (au)', (b.x0 + b.x1) / 2, b.y1 + 31 * dpr);
      ctx.textAlign = 'right';
      for (const e of [0, 0.1, 0.2, 0.3, 0.4]) ctx.fillText(e.toFixed(1), b.x0 - 6 * dpr, Y(e) + 4 * dpr);
      ctx.save(); ctx.translate(12 * dpr, (b.y0 + b.y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('eccentricity', 0, 0); ctx.restore();
      ctx.textAlign = 'center';
      ctx.setLineDash([3 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(233,161,96,0.75)';
      RESONANCES.forEach(([p, q], i) => {
        const x = X(resonanceA(meta.planets.jupiter.a, p, q));
        ctx.beginPath(); ctx.moveTo(x, b.y0 + 14 * dpr); ctx.lineTo(x, b.y1); ctx.stroke();
        ctx.fillText(`${p}:${q}`, x, b.y0 + (i % 2 ? 22 : 10) * dpr);
      });
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- state and controls
  function describe() {
    const year = (epochYear + state.t).toFixed(1);
    const frame = state.rotating ? 'turning with Jupiter' : 'fixed to the stars';
    const view = state.s >= 1 ? 'semi-major axis and eccentricity' : state.s > 0 ? 'between space and the semi-major axis view' : 'positions in space, seen from above the ecliptic';
    return `Year ${year}, frame ${frame}, view: ${view}.`;
  }
  function sync(announce) {
    ui.time.value = state.t; ui.timeOut.value = `${(epochYear + state.t).toFixed(1)}`;
    ui.morph.value = state.s; ui.morphOut.value = state.s <= 0 ? 'Space' : state.s >= 1 ? 'Semi-major axis' : 'In between';
    ui.frame.forEach((r) => { r.checked = (r.value === 'jupiter') === state.rotating; });
    ui.show.forEach((c, i) => { c.checked = state.show[i]; });
    ui.play.textContent = state.playing ? 'Pause' : 'Play';
    ui.play.setAttribute('aria-pressed', String(state.playing));
    ui.status.textContent = describe();
    canvas.setAttribute('aria-label', `Map of ${meta.counts.total.toLocaleString('en')} asteroid orbits. ${describe()}`);
    if (announce) ui.live.textContent = describe();
    draw();
  }

  let last = 0, morphAnim = null;
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const speed = Number(ui.speed.value);
    if (reduceMotion) {                         // move in whole steps once a second
      if (!tick.acc) tick.acc = 0;
      tick.acc += dt;
      if (tick.acc < 1) { requestAnimationFrame(tick); return; }
      tick.acc = 0; state.t += speed;
    } else state.t += speed * dt;
    if (state.t >= T_MAX || state.t <= T_MIN) { state.t = Math.max(T_MIN, Math.min(T_MAX, state.t)); state.playing = false; sync(true); return; }
    sync(false);
    requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    state.playing = on && orbits !== null;
    if (state.playing && state.t >= T_MAX) state.t = T_MIN;
    sync(!state.playing);
    if (state.playing) { last = performance.now(); requestAnimationFrame(tick); }
  }
  function animateMorph(to) {
    cancelAnimationFrame(morphAnim);
    if (reduceMotion) { state.s = to; sync(true); return; }
    const from = state.s, t0 = performance.now(), dur = 1400 * Math.abs(to - from) + 1;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      state.s = from + (to - from) * u;
      sync(u === 1);
      if (u < 1) morphAnim = requestAnimationFrame(step);
    };
    morphAnim = requestAnimationFrame(step);
  }

  ui.time.min = T_MIN; ui.time.max = T_MAX;
  ui.time.addEventListener('input', () => { state.t = Number(ui.time.value); sync(false); });
  ui.time.addEventListener('change', () => sync(true));
  ui.play.addEventListener('click', () => setPlaying(!state.playing));
  ui.reset.addEventListener('click', () => { state.playing = false; state.t = 0; state.rotating = false; state.s = 0; state.show = [true, true, true]; sync(true); });
  ui.frame.forEach((r) => r.addEventListener('change', () => { state.rotating = r.value === 'jupiter' && r.checked; sync(true); }));
  ui.morph.addEventListener('input', () => { cancelAnimationFrame(morphAnim); state.s = Number(ui.morph.value); sync(false); });
  ui.morph.addEventListener('change', () => sync(true));
  ui.show.forEach((c, i) => c.addEventListener('change', () => { state.show[i] = c.checked; sync(true); }));

  // Buttons in the text set up a view of the figure.
  const actions = {
    snapshot: () => { state.playing = false; state.t = 0; state.rotating = false; state.s = 0; state.show = [true, true, true]; sync(true); },
    play: () => { state.s = 0; state.rotating = false; sync(false); setPlaying(true); },
    rotate: () => { state.s = 0; state.rotating = true; sync(true); },
    resonant: () => { state.s = 0; state.rotating = true; state.show = [false, true, true]; sync(true); },
    gaps: () => { state.playing = false; state.show = [true, true, true]; sync(false); animateMorph(1); },
    back: () => { animateMorph(0); }
  };
  document.querySelectorAll('[data-om-action]').forEach((btn) => btn.addEventListener('click', () => {
    actions[btn.dataset.omAction]();
    if (window.matchMedia('(max-width: 999px)').matches) canvas.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  new ResizeObserver(resize).observe(canvas);
  sync(false);
  fetch(`${root}data/orbitmap/belt.bin`)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
    .then((buffer) => {
      orbits = decodeBelt(buffer, meta);
      pos = new Float32Array(2 * orbits.N);
      posT = NaN;
      ui.load.textContent = `${orbits.N.toLocaleString('en')} orbits loaded.`;
      document.querySelectorAll('.om-controls button, .om-controls input, [data-om-action]').forEach((el) => { el.disabled = false; });
      sync(false);
    })
    .catch((err) => { ui.load.textContent = `The orbit data could not be loaded (${err.message}).`; });
}
