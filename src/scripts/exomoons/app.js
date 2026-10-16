// Interactive page on how planets lose their moons around white dwarfs (after Payne,
// Veras, Holman & Gänsicke 2016 and Payne et al. 2017): (1) the star's mass loss and
// the growing Hill sphere; (2) one planet-planet encounter, from the notebook's
// 10,000-moon runs, with the option to integrate moons in the browser; (3) a close
// pericentre passage; (4) the notebook's scattering ensemble. Nothing runs on its own;
// the notebook's data load when section 2 is near.
import * as P from './physics.js';
import { COLORS, fit, frame, dot, fmt, sig } from '../plotting.js';

// Present-day moons (semi-major axes in km) and Hill radii of their planets (PVHG16 Eq. 1,
// a(1 - e)): Jupiter a = 5.2026 au, e = 0.0489; Earth a = 1.0 au, e = 0.0167.
const KM = 1 / P.AU_KM;
const SYSTEMS = {
  jupiter: { name: 'Jupiter', a: 5.2026, rH: P.hillRadius(5.2026, 0.0489, P.M_JUP, 1),
    moons: [['Io', 421700], ['Europa', 671034], ['Ganymede', 1070412], ['Callisto', 1882709]] },
  earth: { name: 'Earth', a: 1.0, rH: P.hillRadius(1.0, 0.0167, P.M_EARTH, 1), moons: [['the Moon', 384400]] }
};
const LIMIT = 0.5;      // typical outer stability limit for prograde moons, in r_H

export function startExomoons(base) {
  const $ = (id) => document.getElementById(id);
  const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

  // ============================ 1. Mass loss =========================================
  const mlCanvas = $('em-ml'), mlZoom = $('em-ml-zoom'), mlRead = $('em-ml-read');
  const mlT = $('em-ml-t'), mlTOut = $('em-ml-t-out');
  function prog() { return Number(radio('em-prog')); }
  function massNow() {
    const M0 = prog(), Mwd = M0 / P.HILL_GROWTH[M0] ** 0.75, f = Number(mlT.value);
    return { M0, Mwd, M: M0 + f * (Mwd - M0), f };
  }
  function drawML() {
    const sys = SYSTEMS[radio('em-planet')];
    const { M0, Mwd, M, f } = massNow();
    const grow = M0 / M;                                       // a ∝ 1/M (adiabatic)
    const hill = grow ** (4 / 3);                              // r_H ∝ a M^(-1/3)
    mlTOut.textContent = `star ${M.toFixed(2)} M☉ (${f === 0 ? 'main sequence' : f === 1 ? 'white dwarf' : 'losing mass'})`;
    // system view
    {
      const { ctx, w, h } = fit(mlCanvas);
      const amax = sys.a * M0 / Mwd * 1.15, s = Math.min(w, h) / (2 * amax), cx = w / 2, cy = h / 2;
      ctx.fillStyle = '#0d1424'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, sys.a * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#7fb3d5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, sys.a * grow * s, 0, 2 * Math.PI); ctx.stroke();
      dot(ctx, cx, cy, f < 1 ? 6 : 3.5, f < 1 ? '#ffcf66' : '#e8f0ff');   // not to scale
      const px = cx + sys.a * grow * s * Math.cos(-0.6), py = cy + sys.a * grow * s * Math.sin(-0.6);
      ctx.strokeStyle = 'rgba(36,185,190,0.9)'; ctx.beginPath(); ctx.arc(px, py, sys.rH * hill * s, 0, 2 * Math.PI); ctx.stroke();
      dot(ctx, px, py, 3.5, '#d8a46b');
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${sys.name}'s orbit: ${(sys.a * grow).toFixed(1)} au (dashed: today)`, 8, 8);
      ctx.fillText('teal: its Hill sphere', 8, 24);
    }
    // zoom on the planet: Hill sphere and moons, in km
    {
      const { ctx, w, h } = fit(mlZoom);
      const rHkm = sys.rH * hill / KM, rH0km = sys.rH / KM;
      const R = Math.min(w, h) / 2 - 10;
      const cx = w / 2, cy = h / 2;
      ctx.fillStyle = '#fbfdfd'; ctx.fillRect(0, 0, w, h);
      // log-like display: draw radii with r -> R * sqrt(r / rmax) so inner moons stay visible
      const rmax = LIMIT * rHkm;
      const disp = (r) => R * Math.sqrt(Math.min(r / rmax, 1.6) / 1.6) * 1.0;
      ctx.strokeStyle = '#24b9be'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, disp(LIMIT * rHkm), 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = '#c4160c'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, disp(LIMIT * rH0km), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx, cx, cy, 4, '#d8a46b');
      ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      sys.moons.forEach(([name, akm], k) => {
        const r = disp(akm), ang = -0.5 + k * 1.2;
        ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
        const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
        dot(ctx, x, y, 3, COLORS.ink);
        ctx.fillStyle = COLORS.ink; ctx.fillText(name, x + 6, y);
      });
      ctx.fillStyle = COLORS.text; ctx.textBaseline = 'top';
      ctx.fillText('teal: half the Hill radius now; red dashed: on the main sequence', 8, 8);
      ctx.fillText('(radii on a square-root scale)', 8, 24);
      const outer = sys.moons[sys.moons.length - 1];
      mlRead.textContent = `The Hill radius has grown ${hill.toFixed(2)}-fold. ${outer[0][0].toUpperCase() + outer[0].slice(1)} now orbits at ${(outer[1] / rHkm).toFixed(3)} of it, against ${(outer[1] / rH0km).toFixed(3)} today. A ${M0} M☉ star ends as a ${Mwd.toFixed(2)} M☉ white dwarf.`;
    }
  }
  mlT.addEventListener('input', drawML);
  document.querySelectorAll('input[name="em-prog"], input[name="em-planet"]').forEach((el) => el.addEventListener('change', () => { drawML(); drawPeri(); }));

  // ============================ 2. One encounter =====================================
  const mapCanvas = $('em-map'), curveCanvas = $('em-curve'), pathCanvas = $('em-path');
  const encStatus = $('em-enc-status'), runBtn = $('em-run');
  let data = null, loading = false, caseName = 'B', custom = null, browserMoons = [], worker = null, runId = 0;
  const cin = { mass: $('em-c-mass'), q: $('em-c-q'), v: $('em-c-v') };
  const cout = { q: $('em-c-q-out'), v: $('em-c-v-out') };

  function flybyNow() {
    if (!custom) return { ...P.FLYBYS[caseName] };
    const mp = cin.mass.value === 'jupiter' ? P.M_JUP : P.M_EARTH;
    const rH = P.hillRadius(P.A_P, 0, mp, P.M_STAR);
    const q = 10 ** Number(cin.q.value) * rH, vq = 10 ** Number(cin.v.value);
    return { q, vq, mp, tSim: Math.min(3e4, Math.max(2000, 3 * 4 * rH / vq)) };
  }
  function showCustom() {
    const mp = cin.mass.value === 'jupiter' ? P.M_JUP : P.M_EARTH, rH = P.hillRadius(P.A_P, 0, mp, P.M_STAR);
    cout.q.textContent = `${sig(10 ** Number(cin.q.value))} r_H = ${sig(10 ** Number(cin.q.value) * rH)} au`;
    cout.v.textContent = `${sig(10 ** Number(cin.v.value) * 1000)} × 10⁻³ au/day = ${sig(10 ** Number(cin.v.value) * P.AU_KM / 86400)} km/s`;
  }

  async function loadData() {
    if (data || loading) return;
    loading = true; encStatus.textContent = 'Loading the notebook’s encounters…';
    try {
      const r = await fetch(`${base}data/exomoons/encounters.json`);
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      encStatus.textContent = '';
      drawEncounter(); drawScatter();
    } catch (e) { encStatus.textContent = 'The notebook’s data could not be loaded. Try reloading the page.'; loading = false; }
  }
  new IntersectionObserver((es, obs) => { if (es.some((e) => e.isIntersecting)) { loadData(); obs.disconnect(); } }, { rootMargin: '400px' }).observe($('em-encounter'));

  function drawMap() {
    const { ctx, w, h } = fit(mapCanvas);
    const f = frame(ctx, w, h, { x0: 1e-4, x1: 0.6, y0: 3e-3, y1: 1, xlog: true, ylog: true, xlabel: 'moon’s semi-major axis / Hill radius', ylabel: 'moon’s eccentricity' });
    f.clip();
    const d = !custom && data ? data.cases[caseName] : null;
    if (d) {
      for (let k = 0; k < d.a.length; k++) {
        const ok = d.bound[k] === '1';
        ctx.fillStyle = ok ? 'rgba(214,39,40,0.55)' : 'rgba(17,17,17,0.75)';
        ctx.fillRect(f.X(d.a[k]) - 1, f.Y(Math.max(d.e[k], 3e-3)) - 1, 2, 2);
      }
    }
    for (const m of browserMoons) {
      if (!m.result || m.result.unresolved) continue;
      const x = f.X(m.a / m.rH), y = f.Y(Math.max(m.e, 3e-3));
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.fillStyle = m.result.bound ? '#ff7f0e' : '#1f77b4';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let y0 = f.T + 4;
    if (d) { ctx.fillStyle = '#d62728'; ctx.fillText('red: survived (notebook)', f.L + 6, y0); ctx.fillStyle = '#111'; ctx.fillText('black: lost (notebook)', f.L + 150, y0); y0 += 14; }
    if (browserMoons.length) { ctx.fillStyle = '#c55a00'; ctx.fillText('orange: survived (your browser)', f.L + 6, y0); ctx.fillStyle = '#1f77b4'; ctx.fillText('blue: lost (your browser)', f.L + 190, y0); }
  }

  function drawCurve() {
    const { ctx, w, h } = fit(curveCanvas);
    const f = frame(ctx, w, h, { x0: 1e-4, x1: 0.6, y0: 0, y1: 1.05, xlog: true, xlabel: 'moon’s semi-major axis / Hill radius', ylabel: 'fraction surviving', yticks: [0, 0.25, 0.5, 0.75, 1] });
    if (data) {
      const b = data.bins, mid = (k) => Math.sqrt(b[k] * b[k + 1]);
      for (const [name, c] of Object.entries(data.cases)) {
        const on = !custom && name === caseName;
        ctx.strokeStyle = on ? COLORS.red : 'rgba(120,140,150,0.45)'; ctx.lineWidth = on ? 2.5 : 1;
        ctx.beginPath(); let pen = false;
        c.curve.forEach((v, k) => { if (v == null) { pen = false; return; } const x = f.X(mid(k)), y = f.Y(v); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; });
        ctx.stroke();
        if (on) { ctx.fillStyle = COLORS.red; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${name} (notebook, 10,000 moons)`, f.L + 8, f.T + 16); }
      }
    }
    // the browser run, binned coarsely
    const done = browserMoons.filter((m) => m.result && !m.result.unresolved);
    if (done.length >= 10) {
      const edges = [0.003, 0.006, 0.012, 0.025, 0.05, 0.1, 0.2, 0.5];
      for (let k = 0; k < edges.length - 1; k++) {
        const sel = done.filter((m) => m.a / m.rH >= edges[k] && m.a / m.rH < edges[k + 1]);
        if (sel.length < 3) continue;
        const fr = sel.filter((m) => m.result.bound).length / sel.length;
        const x = f.X(Math.sqrt(edges[k] * edges[k + 1]));
        dot(ctx, x, f.Y(fr), 5, '#ff7f0e');
        ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.arc(x, f.Y(fr), 5, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.fillStyle = '#c55a00'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`orange: your browser (${done.length} moons)`, f.L + 8, f.T + 32);
    }
  }

  let pathCache = { key: '', pts: null };
  function drawPath() {
    const c = flybyNow(), key = JSON.stringify(c);
    if (key !== pathCache.key) pathCache = { key, pts: P.flybyPath(c, 300) };
    const { ctx, w, h } = fit(pathCanvas);
    const rH = P.hillRadius(P.A_P, 0, c.mp, P.M_STAR);
    const pts = pathCache.pts;
    let ext = 1.2 * rH;
    for (const p of pts) ext = Math.max(ext, Math.min(Math.hypot(p[0], p[1]) * 1.05, 6 * rH));
    const s = Math.min(w, h) / (2 * ext), cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#fbfdfd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#24b9be'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, rH * s, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, 0.5 * rH * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#d35400'; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((p, k) => { const x = cx + p[0] * s, y = cy - p[1] * s; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    dot(ctx, cx, cy, 4, '#8a5a2b');
    const p0 = pts[0]; dot(ctx, cx + p0[0] * s, cy - p0[1] * s, 4, '#d35400');
    ctx.fillStyle = COLORS.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('The flyby planet, seen from the parent', 8, 8);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('teal: Hill sphere (dashed: half of it); dot: start', 8, 24);
    let dmin = Infinity; for (const p of pts) dmin = Math.min(dmin, Math.hypot(...p));
    ctx.fillText(`closest approach ${sig(c.q)} au = ${sig(c.q / rH)} r_H; ${fmt(c.tSim)} days shown`, 8, h - 18);
  }

  function describeCase() {
    const c = flybyNow(), rH = P.hillRadius(P.A_P, 0, c.mp, P.M_STAR);
    const d = !custom && data ? data.cases[caseName] : null;
    const planet = c.mp > 1e-4 ? 'Jupiter' : 'Earth';
    let text = `${custom ? 'Your encounter' : `Encounter ${caseName} (${P.FLYBYS[caseName].note.toLowerCase()})`}: two ${planet}-mass planets pass ${sig(c.q)} au apart (${sig(c.q / rH)} Hill radii) at ${sig(c.vq * P.AU_KM / 86400)} km/s.`;
    if (d) text += ` In the notebook, ${(100 * d.survive).toFixed(1)}% of its 10,000 moons survived${d.captured ? `, and ${d.captured} were captured by the other planet` : ''}.`;
    $('em-enc-read').textContent = text;
  }
  function drawEncounter() { describeCase(); drawMap(); drawCurve(); drawPath(); }

  document.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => {
    custom = null; caseName = b.dataset.case; stopRun(); browserMoons = [];
    document.querySelectorAll('[data-case]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawEncounter();
  }));
  Object.values(cin).forEach((el) => el.addEventListener('input', () => {
    custom = true; stopRun(); browserMoons = []; showCustom();
    document.querySelectorAll('[data-case]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    drawEncounter();
  }));

  function stopRun() { if (worker) { worker.terminate(); worker = null; } runBtn.disabled = false; }
  runBtn.addEventListener('click', () => {
    stopRun();
    const c = flybyNow(), rH = P.hillRadius(P.A_P, 0, c.mp, P.M_STAR);
    const n = Number($('em-n').value);
    let s = (Date.now() & 0xffffff) | 1;
    const rng = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
    const moons = P.sampleMoons(n, rH, c.mp > 1e-4 ? P.R_JUP : P.R_EARTH, rng, 0.003, 0.5);
    browserMoons = moons.map((m) => ({ ...m, rH, result: null }));
    const id = ++runId;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    runBtn.disabled = true;
    const t0 = performance.now();
    let doneN = 0, last = 0;
    encStatus.textContent = `Integrating ${n} moons in your browser…`;
    worker.onmessage = ({ data: msg }) => {
      if (msg.id !== id) return;
      if (msg.type === 'moon') {
        browserMoons[msg.k].result = msg.result; doneN += 1;
        if (performance.now() - last > 250) { last = performance.now(); encStatus.textContent = `Integrating in your browser: ${doneN} of ${n} moons…`; drawMap(); drawCurve(); }
      } else if (msg.type === 'done') {
        const surv = browserMoons.filter((m) => m.result.bound).length;
        const unres = browserMoons.filter((m) => m.result.unresolved).length;
        encStatus.textContent = `Done: ${surv} of ${n - unres} moons (between 0.003 and 0.5 Hill radii) survived, in ${((performance.now() - t0) / 1000).toFixed(1)} s.`
          + (unres ? ` ${unres === 1 ? 'One moon' : `${unres} moons`} passed so close to a planet, so often, that this page could not follow ${unres === 1 ? 'it' : 'them'} to the end; ${unres === 1 ? 'it is' : 'they are'} left out.` : '');
        runBtn.disabled = false; worker.terminate(); worker = null; drawMap(); drawCurve();
      }
    };
    worker.onerror = () => { encStatus.textContent = 'The integration failed in this browser.'; stopRun(); };
    worker.postMessage({ id, flyby: c, moons });
  });

  // ============================ 3. Close to the white dwarf ==========================
  const periCanvas = $('em-peri'), periIn = $('em-peri-q'), periOut = $('em-peri-q-out'), periRead = $('em-peri-read');
  function drawPeri() {
    const sys = SYSTEMS[radio('em-planet')];
    const { M0 } = massNow();
    const qa = 10 ** Number(periIn.value);
    periOut.textContent = `pericentre at ${sig(qa)} of the orbit’s size (e = ${(1 - qa).toFixed(3)})`;
    const hillWD = sys.rH * P.HILL_GROWTH[M0];               // after mass loss, circular orbit
    const hillQ = hillWD * qa;                               // r_H ∝ a(1 - e) = q
    const { ctx, w, h } = fit(periCanvas);
    const f = frame(ctx, w, h, { x0: 1e-3, x1: 3, y0: 0, y1: 1, xlog: true, xlabel: 'moon’s orbit / Hill radius at pericentre', ylabel: '', yticks: [] });
    ctx.fillStyle = 'rgba(196,22,12,0.08)'; ctx.fillRect(f.X(0.5), f.T, f.X(3) - f.X(0.5), f.ph);
    ctx.fillStyle = 'rgba(196,22,12,0.15)'; ctx.fillRect(f.X(1), f.T, f.X(3) - f.X(1), f.ph);
    ctx.fillStyle = COLORS.red; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('beyond 0.5: unstable', f.X(0.5) + 4, f.T + 4); ctx.fillText('beyond 1', f.X(1) + 4, f.T + 18);
    const lines = [];
    sys.moons.forEach(([name, akm], k) => {
      const x = akm * KM / hillQ, y = 0.2 + 0.6 * (k + 0.5) / sys.moons.length;
      const xc = Math.min(Math.max(x, 1e-3), 3);
      dot(ctx, f.X(xc), f.T + f.ph * (1 - y), 5, x > 1 ? COLORS.red : x > 0.5 ? '#e67e22' : COLORS.teal);
      ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'middle'; ctx.fillText(`${name} (${sig(x)})`, f.X(xc) + 8, f.T + f.ph * (1 - y));
      lines.push([name, x]);
    });
    const lost = lines.filter(([, x]) => x > 0.5).map(([n]) => n);
    periRead.textContent = `After a ${M0} M☉ star has become a white dwarf, ${sys.name}'s Hill radius is ${P.HILL_GROWTH[M0].toFixed(2)} times today's; at this pericentre it shrinks to ${sig(qa * P.HILL_GROWTH[M0])} times today's. `
      + (lost.length ? `${lost.join(', ')} would then orbit beyond half of it. ` : 'All these moons stay inside half of it. ')
      + 'The notebook shows that one brief passage frees moons less easily than this suggests (see below).';
  }
  periIn.addEventListener('input', drawPeri);

  // ============================ 4. The scattering ensemble ===========================
  const scCanvas = $('em-scatter'), scSel = $('em-sys');
  function drawScatter() {
    if (!data || !data.scatter) { $('em-scatter-status').textContent = data ? 'The scattering runs are not in this build.' : ''; return; }
    const sc = data.scatter, k = Number(scSel.value), sys = sc.systems[k];
    const { ctx, w, h } = fit(scCanvas);
    const t = sc.t, tmax = t[t.length - 1];
    // one linear range for all systems, fitted to the data, so systems can be compared
    if (!sc.range) {
      let lo = Infinity, hi = -Infinity;
      sc.systems.forEach((s) => [...s.planets, ...s.moons].forEach((qs) => qs.forEach((q) => { if (q != null) { lo = Math.min(lo, q); hi = Math.max(hi, q); } })));
      sc.range = [Math.max(0, Math.floor(lo * 10) / 10 - 0.1), Math.ceil(hi * 10) / 10 + 0.1];
    }
    const f = frame(ctx, w, h, { x0: 0, x1: tmax, y0: sc.range[0], y1: sc.range[1], xlabel: 'time (years)', ylabel: 'pericentre about the white dwarf (au)', xfmt: (v) => fmt(v) });
    f.clip();
    sys.planets.forEach((qs) => { ctx.strokeStyle = 'rgba(90,110,120,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); let pen = false; qs.forEach((q, i) => { if (q == null) { pen = false; return; } const x = f.X(t[i]), y = f.Y(q); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }); ctx.stroke(); });
    const cols = ['#d62728', '#ff7f0e', '#2ca02c', '#9467bd'];
    sys.moons.forEach((qs, j) => { qs.forEach((q, i) => { if (q != null) dot(ctx, f.X(t[i]), f.Y(q), 1.6, cols[j]); }); });
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.text; ctx.fillText('grey lines: the four planets; dots: their moons, once freed', f.L + 6, f.T + 4);
    let minP = Infinity, minM = Infinity;
    sys.planets.forEach((qs) => qs.forEach((q) => { if (q != null) minP = Math.min(minP, q); }));
    sys.moons.forEach((qs) => qs.forEach((q) => { if (q != null) minM = Math.min(minM, q); }));
    $('em-scatter-status').textContent = `System ${k + 1}: closest planet pericentre ${sig(minP)} au; closest freed-moon pericentre ${Number.isFinite(minM) ? `${sig(minM)} au` : 'none freed'}. (For scale: the white dwarf’s tides would tear a moon apart within about 0.01 au.)`;
  }
  scSel.addEventListener('change', drawScatter);

  // ============================ start ===============================================
  showCustom(); drawML(); drawPeri(); drawEncounter();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { drawML(); drawPeri(); drawEncounter(); drawScatter(); }); });
}
