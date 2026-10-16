// Interactive page: could the Cassini ranging have detected Planet Nine? (Holman & Payne 2016)
import { DEG, unit, signature, dchi2, gram, limit } from './model.js';
import { COLORS, fit, frame, dot, sci } from '../plotting.js';

const BASE = `${import.meta.env.BASE_URL}data/cassini/`;
const THRESH = 14.2;            // 3 sigma for three parameters, as in HP16
const STEP = 2;                 // sky-map resolution (deg)
// a perceptually ordered ramp (viridis stops), for log10 of the limit
const RAMP = [[253, 231, 37], [94, 201, 98], [33, 145, 140], [59, 82, 139], [68, 1, 84]];
const ramp = (f) => {
  const x = Math.min(Math.max(f, 0), 1) * (RAMP.length - 1), i = Math.min(Math.floor(x), RAMP.length - 2), t = x - i;
  return RAMP[i].map((c, k) => Math.round(c + t * (RAMP[i + 1][k] - c)));
};

export function startCassini() {
  const $ = (id) => document.getElementById(id);
  const el = { sky: $('cp-sky'), sig: $('cp-sig'), read: $('cp-read'), sigRead: $('cp-sig-read'), status: $('cp-status'),
    ra: $('cp-ra'), raOut: $('cp-ra-out'), dec: $('cp-dec'), decOut: $('cp-dec-out'), mass: $('cp-mass'), massOut: $('cp-mass-out'),
    dist: $('cp-dist'), distOut: $('cp-dist-out'), nu: $('cp-nu'), nuOut: $('cp-nu-out') };
  let data = null, G = null, lim = null, lo = 0, hi = 1, base = null;
  // the exact position (presets and clicks are not snapped to the sliders' 2-degree steps)
  let pos = { ra: Number(el.ra.value), dec: Number(el.dec.value) }, rExact = null;

  const state = () => {
    const mass = Number(el.mass.value), r = rExact ?? 10 ** Number(el.dist.value);
    return { ra: pos.ra, dec: pos.dec, mass, r, k: mass * data.m_earth / r ** 3 };
  };

  function buildMap() {
    const nx = 360 / STEP, ny = 180 / STEP;
    lim = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      lim[j * nx + i] = limit(G, unit((i + 0.5) * STEP, 90 - (j + 0.5) * STEP), data.sigma, THRESH);
    }
    const logs = Array.from(lim, Math.log10);
    lo = Math.min(...logs); hi = Math.max(...logs);
    base = { nx, ny };
  }

  function drawSky() {
    const s = state();
    const { ctx, w, h } = fit(el.sky);
    const L = 44, R = 10, T = 10, B = 34, pw = w - L - R, ph = h - T - B;
    const X = (ra) => L + (1 - ra / 360) * pw, Y = (dec) => T + (90 - dec) / 180 * ph;   // RA increases to the left
    const { nx, ny } = base;
    const img = ctx.createImageData(nx, ny), mask = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = lim[j * nx + i], c = ramp((Math.log10(v) - lo) / (hi - lo)), p = 4 * (j * nx + (nx - 1 - i));
      img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
      mask.data[p + 3] = s.k >= v ? 255 : 0;
    }
    const off = document.createElement('canvas'); off.width = nx; off.height = ny; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, L, T, pw, ph);
    // red hatching where a planet of this mass and distance would have been detected
    const hatch = document.createElement('canvas'); hatch.width = pw; hatch.height = ph;
    const hc = hatch.getContext('2d');
    const moff = document.createElement('canvas'); moff.width = nx; moff.height = ny; moff.getContext('2d').putImageData(mask, 0, 0);
    hc.imageSmoothingEnabled = false; hc.drawImage(moff, 0, 0, pw, ph);
    hc.globalCompositeOperation = 'source-in';
    hc.strokeStyle = 'rgba(196,22,12,0.9)'; hc.lineWidth = 1.6; hc.beginPath();
    for (let x = -ph; x < pw; x += 7) { hc.moveTo(x, ph); hc.lineTo(x + ph, 0); }
    hc.stroke();
    ctx.drawImage(hatch, L, T);
    ctx.strokeStyle = COLORS.axis; ctx.strokeRect(L, T, pw, ph);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const ra of [0, 60, 120, 180, 240, 300, 360]) ctx.fillText(`${ra}°`, X(ra), T + ph + 4);
    ctx.fillText('right ascension', L + pw / 2, T + ph + 18);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const d of [-60, -30, 0, 30, 60]) ctx.fillText(`${d}°`, L - 5, Y(d));
    // the nominal orbit and Saturn's track
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [ra, dec] of data.nominal.radec) { ctx.fillRect(X(ra) - 1, Y(dec) - 1, 2, 2); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath();
    data.saturn.forEach(([ra, dec], i) => (i ? ctx.lineTo(X(ra), Y(dec)) : ctx.moveTo(X(ra), Y(dec)))); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const sl = data.saturn[data.saturn.length - 1]; ctx.fillText('Saturn 2004–14', X(sl[0]) + 6, Y(sl[1]) - 2);
    // the chosen position, and its mirror (which pulls identically)
    const mra = (s.ra + 180) % 360;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(mra), Y(-s.dec), 5, 0, 2 * Math.PI); ctx.stroke();
    dot(ctx, X(s.ra), Y(s.dec), 6, '#fff'); dot(ctx, X(s.ra), Y(s.dec), 4, COLORS.red); ctx.lineWidth = 1;
    el.sky.dataset.geom = JSON.stringify({ L, T, pw, ph });
    const frac = (() => { let a = 0, tot = 0; for (let j = 0; j < ny; j++) { const wgt = Math.cos((90 - (j + 0.5) * STEP) * DEG); for (let i = 0; i < nx; i++) { tot += wgt; if (s.k >= lim[j * nx + i]) a += wgt; } } return a / tot; })();
    el.sky.setAttribute('aria-label', `Sky map of the ranging's sensitivity. Planet Nine is placed at right ascension ${s.ra}°, declination ${s.dec}°. A planet of this mass and distance would have been detected over ${Math.round(frac * 100)}% of the sky.`);
    return frac;
  }

  function drawSignature(s, sig) {
    const { ctx, w, h } = fit(el.sig);
    const ext = Math.max(150, 1.15 * Math.max(...sig.map(Math.abs)));
    const f = frame(ctx, w, h, { x0: 2004, x1: 2015, y0: -ext, y1: ext, xlabel: 'year', ylabel: 'change in range residual (m)', left: 56 });
    f.clip();
    ctx.fillStyle = 'rgba(7,141,151,0.12)'; ctx.fillRect(f.L, f.Y(data.sigma), f.pw, f.Y(-data.sigma) - f.Y(data.sigma));
    ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.moveTo(f.L, f.Y(0)); ctx.lineTo(f.L + f.pw, f.Y(0)); ctx.stroke();
    data.years.forEach((y, i) => dot(ctx, f.X(y), f.Y(sig[i]), 2.6, COLORS.red));
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COLORS.teal; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`shaded: ±${data.sigma.toFixed(0)} m, the precision of one range residual`, f.L + 6, f.T + 4);
  }

  function render() {
    if (!data) return;
    const s = state();
    el.raOut.textContent = `${s.ra.toFixed(1)}°`; el.decOut.textContent = `${s.dec >= 0 ? '+' : '−'}${Math.abs(s.dec).toFixed(1)}°`;
    el.massOut.textContent = `${s.mass} Earth masses`; el.distOut.textContent = `${Math.round(s.r)} au`;
    const n = unit(s.ra, s.dec), sig = Array.from(signature(data.basis, n, s.k)), d2 = dchi2(sig, data.sigma);
    const kl = limit(G, n, data.sigma, THRESH), frac = drawSky();
    drawSignature(s, sig);
    const rms = Math.sqrt(sig.reduce((a, v) => a + v * v, 0) / sig.length);
    const verdict = d2 >= THRESH ? 'The ranging would have detected it (Δχ² above 14.2, 3σ).' : d2 >= 9 ? 'A marginal signal (Δχ² between 9 and 14.2).' : 'Too weak to detect (Δχ² below 9).';
    el.read.textContent = `M/r³ = ${sci(s.k, 2)} M☉ au⁻³. In this direction, anything above ${sci(kl, 2)} would be detected; a ${s.mass}-Earth-mass planet would have to be at least ${Math.round((s.mass * data.m_earth / kl) ** (1 / 3))} au away to escape notice. `
      + `Planets of this mass and distance would be seen over ${Math.round(frac * 100)}% of the sky (hatched red on the map).`;
    el.sigRead.textContent = `Signature RMS ${rms.toFixed(rms < 10 ? 1 : 0)} m, expected Δχ² ${d2 < 100 ? d2.toFixed(1) : Math.round(d2).toLocaleString('en')}. ${verdict}`;
    el.sig.setAttribute('aria-label', `Planet Nine's signature in the range residuals, 2004 to 2014: root-mean-square ${rms.toFixed(0)} metres. ${verdict}`);
  }

  function place(ra, dec) {
    pos = { ra: ((ra % 360) + 360) % 360, dec: Math.max(-89, Math.min(89, dec)) };
    el.ra.value = String(2 * Math.round(pos.ra / 2) % 360); el.dec.value = String(2 * Math.round(pos.dec / 2));
    render();
  }
  function onNominal() {
    const nu = Number(el.nu.value), i = data.nominal.nu.indexOf(nu - (nu % 2)), [ra, dec] = data.nominal.radec[i];
    el.nuOut.textContent = `${nu}°`;
    el.dist.value = String(Math.log10(data.nominal.r[i])); rExact = data.nominal.r[i]; el.mass.value = '10';
    place(ra, dec);
  }

  el.sky.addEventListener('click', (e) => {
    const g = JSON.parse(el.sky.dataset.geom || 'null'); if (!g) return;
    const rect = el.sky.getBoundingClientRect(), x = e.clientX - rect.left - g.L, y = e.clientY - rect.top - g.T;
    if (x < 0 || y < 0 || x > g.pw || y > g.ph) return;
    place(360 * (1 - x / g.pw), 90 - 180 * y / g.ph);
  });
  el.sky.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[e.key];
    if (d) { e.preventDefault(); place(Number(el.ra.value) + d[0], Number(el.dec.value) + d[1]); }
  });
  el.ra.addEventListener('input', () => { pos.ra = Number(el.ra.value); render(); });
  el.dec.addEventListener('input', () => { pos.dec = Number(el.dec.value); render(); });
  el.dist.addEventListener('input', () => { rExact = null; render(); });
  el.mass.addEventListener('input', render);
  el.nu.addEventListener('input', onNominal);
  document.querySelectorAll('[data-cp-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.cpPreset;
    if (p === 'nu60') { el.nu.value = '60'; onNominal(); }
    else if (p === 'nu117') { el.nu.value = '116'; onNominal(); }
    else if (p === 'hp16') { el.mass.value = '10'; el.dist.value = String(Math.log10(700)); rExact = 700; place(40, -15); }
  }));
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });

  fetch(`${BASE}basis.json`).then((r) => r.json()).then((d) => {
    data = d; G = gram(d.basis); buildMap();
    el.status.textContent = `Sky map: from ${sci(10 ** lo, 1)} (yellow) to ${sci(10 ** hi, 1)} M☉ au⁻³ (purple), the smallest M/r³ the ranging would detect in each direction.`;
    el.nuOut.textContent = `${el.nu.value}°`;
    render();
  }).catch(() => { el.status.textContent = 'The model data could not be loaded. Try reloading the page.'; });
}
