// The GJ 876 Laplace-resonance page: resonant angles over 60 years for N16's coplanar median
// solution, with planet e's mass scaled, and where the planets' conjunctions fall.
import { COLORS, fit, frame, dot } from '../plotting.js';

// N16 Table 8 (coplanar): median amplitude and its 15.9/84.1 percentile offsets, in degrees
const N16 = { cb_c: [4.0, 1.4, 1.6], cb_b: [13.4, 1.4, 3.0], be_b: [31.3, 8.7, 11.9], laplace: [33.0, 9.3, 12.4] };
const LABELS = {
  cb_c: ['φ<sub>c</sub><sup>cb</sup> = λ<sub>c</sub> − 2λ<sub>b</sub> + ϖ<sub>c</sub>', 'φ_c (c–b, 2:1)'],
  cb_b: ['φ<sub>b</sub><sup>cb</sup> = λ<sub>c</sub> − 2λ<sub>b</sub> + ϖ<sub>b</sub>', 'φ_b (c–b, 2:1)'],
  be_b: ['φ<sub>b</sub><sup>be</sup> = λ<sub>b</sub> − 2λ<sub>e</sub> + ϖ<sub>b</sub>', 'φ_b (b–e, 2:1)'],
  laplace: ['Laplace angle λ<sub>c</sub> − 3λ<sub>b</sub> + 2λ<sub>e</sub>', 'Laplace angle']
};
const KEYS = ['cb_c', 'cb_b', 'be_b', 'laplace'];
const COL = { cb_c: '#3b528b', cb_b: '#078d97', be_b: '#e67e22', laplace: '#c4160c' };

export function startLaplace() {
  const $ = (id) => document.getElementById(id);
  const radio = (n) => document.querySelector(`input[name="${n}"]:checked`).value;
  const angCanvas = $('gj-angles'), conjCanvas = $('gj-conj'), status = $('gj-status'), table = $('gj-table');
  const tWin = $('gj-window');
  let worker = null, res = null;

  function run() {
    if (worker) worker.terminate();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const eMass = Number(radio('gj-emass'));
    status.textContent = 'Integrating 60 years…';
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) { status.textContent = `Integrating 60 years… ${Math.round(100 * data.progress)}%`; return; }
      res = data; worker.terminate(); worker = null;
      const lap = data.amp.laplace;
      status.textContent = `Planet e at ${eMass === 1 ? 'its fitted mass' : `${eMass}× its fitted mass`}: the Laplace angle `
        + (lap === null ? 'circulates: the three planets are no longer locked together.' : `librates with an amplitude of ${lap.toFixed(0)}°.`);
      draw();
    };
    worker.postMessage({ eMass, years: 60 });
  }

  function draw() {
    if (!res) return;
    const span = Number(tWin.value);
    $('gj-window-out').textContent = `${span} years`;
    // four stacked panels on one canvas
    const { ctx, w, h } = fit(angCanvas);
    const ph = h / 4;
    KEYS.forEach((key, i) => {
      ctx.save(); ctx.translate(0, i * ph);
      const f = frame(ctx, w, ph, { x0: 0, x1: span, y0: -180, y1: 180, yticks: [-180, -90, 0, 90, 180], xlabel: i === 3 ? 'years' : '', ylabel: '', top: 16, left: 46 });
      f.clip();
      ctx.fillStyle = COL[key];
      const a = res.ang;
      for (let k = 0; k < a.t.length && a.t[k] <= span; k++) ctx.fillRect(f.X(a.t[k]) - 1, f.Y(a[key][k] / (Math.PI / 180)) - 1, 2, 2);
      ctx.restore();   // the clip
      ctx.restore();   // the translation
      ctx.fillStyle = COLORS.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${LABELS[key][1]} (degrees)`, 50, i * ph + 1);
    });
    // amplitude table
    table.innerHTML = KEYS.map((key) => {
      const a = res.amp[key], [m, lo, hi] = N16[key];
      const inside = a !== null && a >= m - lo && a <= m + hi;
      return `<tr><th scope="row">${LABELS[key][0]}</th><td>${a === null ? 'circulates' : `${a.toFixed(1)}°`}</td><td>${m}° (${(m - lo).toFixed(1)}–${(m + hi).toFixed(1)}°)</td>`
        + `<td>${res.eMass === 1 ? (inside ? 'inside' : 'outside') : '—'}</td></tr>`;
    }).join('');
    drawConj();
  }

  function drawConj() {
    const { ctx, w, h } = fit(conjCanvas);
    const R = Math.min(w, h) / 2 - 34, cx = w / 2, cy = h / 2;
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R + 8, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('b’s pericentre', cx + R * 0.3, cy - 9);
    const span = Number(tWin.value);
    const put = (list, rr, c) => { for (const q of list) if (q.t <= span) dot(ctx, cx + rr * Math.cos(q.x), cy - rr * Math.sin(q.x), 2.2, c); };
    put(res.conj.cb, R, COL.cb_b);
    put(res.conj.be, R * 0.72, COL.be_b);
    dot(ctx, cx, cy, 6, '#f2b632');
    const n = (l) => l.filter((q) => q.t <= span).length;
    $('gj-conj-read').textContent = `${n(res.conj.cb)} conjunctions of c and b (outer ring) and ${n(res.conj.be)} of b and e (inner ring) in ${span} years, `
      + 'each plotted at planet b’s longitude measured from its own pericentre.';
  }

  document.querySelectorAll('input[name="gj-emass"]').forEach((r) => r.addEventListener('change', run));
  tWin.addEventListener('input', draw);
  run();
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(draw); });
}
