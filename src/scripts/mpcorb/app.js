// Interactive page on mpc_orb.json orbit files: a summary of the file, its three element sets
// (checked against a conversion done here), the correlation matrix, and 500 clones drawn from
// the covariance and moved in time with two-body motion.
import { unwrap, block, stateToElements, propagate, sampleStates, rtn, correlation, mjdToDate, AU_KM, GM } from './orbit.js';
import { COLORS, fit, frame, dot, sci, fmt, logLabel } from '../plotting.js';

const BASE = `${import.meta.env.BASE_URL}data/mpc_orb/`;
const N_CLONES = 500, YEAR = 365.25;
const T_GRID = Array.from({ length: 801 }, (_, i) => -20 + i * 0.05), N_GROWTH = 200;
const UNITS = {
  x: 'au', y: 'au', z: 'au', vx: 'au/day', vy: 'au/day', vz: 'au/day', q: 'au', a: 'au', e: '', i: '°', node: '°', argperi: '°',
  peri_time: 'MJD', mean_anomaly: '°'
};
const LABELS = {
  x: 'x', y: 'y', z: 'z', vx: 'vₓ', vy: 'v_y', vz: 'v_z', q: 'q', a: 'a', e: 'e', i: 'i', node: 'Ω (node)', argperi: 'ω (arg. of perihelion)',
  peri_time: 'T (perihelion time)', mean_anomaly: 'M (mean anomaly)', yarkovsky: 'Yarkovsky A2', A1: 'A1', A2: 'A2', A3: 'A3', DT: 'DT', srp: 'SRP'
};
const REP_NAMES = { CAR: 'Cartesian (CAR)', COM: 'Cometary (COM)', KEP: 'Keplerian (KEP)' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (x) => (typeof x !== 'number' ? '—' : Math.abs(x) >= 1e4 || x === 0 ? String(Number(x.toPrecision(12))) : x.toPrecision(10).replace(/\.?0+$/, ''));
const unc = (x) => (typeof x !== 'number' ? '' : x === 0 ? '0' : sci(x, 1));
/** A length in km, switching to au when large. */
const len = (km) => (km >= 0.1 * AU_KM ? `${Number((km / AU_KM).toPrecision(2))} au` : km >= 1000 ? `${fmt(Math.round(km / 100) * 100)} km` : km >= 10 ? `${Math.round(km)} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`);

export function startMpcOrb() {
  const $ = (id) => document.getElementById(id);
  const el = { samples: $('mo-samples'), file: $('mo-file'), text: $('mo-text'), go: $('mo-text-go'), error: $('mo-error'), summary: $('mo-summary'),
    tables: $('mo-tables'), check: $('mo-check'), corr: $('mo-corr'), corrRead: $('mo-corr-read'), t: $('mo-t'), tOut: $('mo-t-out'),
    orbit: $('mo-orbit'), cloud: $('mo-cloud'), cloudRead: $('mo-cloud-read'), growth: $('mo-growth') };
  let S = null;   // the current orbit and everything derived from it
  let index = [];

  function showError(msg) { el.error.textContent = msg; el.error.hidden = !msg; }

  function setOrbit(json, meta) {
    let o;
    try { o = unwrap(json); } catch (err) { showError(err.message); return; }
    showError('');
    const car = block(o, 'CAR'), epoch = o.epoch_data.epoch;
    const reps = ['CAR', 'COM', 'KEP'].map((r) => [r, block(o, r)]).filter(([, b]) => b);
    const nominal = car.values.slice(0, 6);
    const conv = stateToElements(nominal, epoch);
    const clones = car.C ? sampleStates(car, N_CLONES, 1) : null;
    // spread of the clones in the RTN frame of the nominal orbit, on the time grid
    const growth = clones ? T_GRID.map((ty) => {
      const nom = propagate(nominal, ty * YEAR);
      const d = rtn(nom, clones.slice(0, N_GROWTH).map((c) => propagate(c, ty * YEAR)));
      const sd = (k) => Math.sqrt(d.reduce((s, x) => s + x[k] * x[k], 0) / d.length);
      return [sd(0), sd(1), sd(2)];
    }) : null;
    S = { o, meta, car, reps, epoch, nominal, conv, clones, growth };
    renderSummary(); renderTables(); renderCorr(); renderCloud();
  }

  function renderSummary() {
    const { o, meta } = S;
    const d = o.designation_data || {}, f = o.orbit_fit_statistics || {}, sw = o.software_data || {}, sys = o.system_data || {}, cat = o.categorization || {};
    const name = [d.iau_designation, d.name || d.iau_name].filter(Boolean).join(' ') || d.unpacked_primary_provisional_designation || 'Unnamed object';
    const prov = d.unpacked_primary_provisional_designation && d.iau_designation ? ` = ${d.unpacked_primary_provisional_designation}` : '';
    const ng = o.non_grav_booleans?.non_gravs ? Object.entries(o.non_grav_booleans.non_grav_coefficients || {}).filter(([, v]) => v).map(([k]) => LABELS[k] || k).join(', ') : 'none';
    const rows = [
      ['Object type', [cat.object_type_str, cat.orbit_type_str].filter(Boolean).join(' · ') || '—'],
      ['Epoch', `MJD ${S.epoch} (${o.epoch_data.timesystem}) = ${mjdToDate(S.epoch)}`],
      ['Observations used', f.nobs_total_sel != null ? `${fmt(f.nobs_total_sel)} of ${fmt(f.nobs_total)}` : '—'],
      ['Arc', f.arc_length_sel && f.arc_length_sel !== f.arc_length_total ? `${f.arc_length_sel} (all: ${f.arc_length_total})` : f.arc_length_total || '—'],
      ['Normalised RMS', f.normalized_RMS != null ? String(Number(Number(f.normalized_RMS).toPrecision(3))) : '—'],
      ['Uncertainty parameter U', f.U_param ?? '—'],
      ['Non-gravitational terms', ng],
      ['Force model', [sys.force_model, sys.eph].filter(Boolean).join(', planets from ') || '—'],
      ['Fitted by', sw.fitting_software_name ? `${sw.fitting_software_name} ${sw.fitting_software_version ?? ''}, ${sw.fitting_datetime ?? ''}` : '—'],
      ['File format version', sw.mpcorb_version ?? '—']
    ];
    el.summary.innerHTML = `<h3>${esc(name)}${esc(prov)}</h3>${meta.note ? `<p class="mo-note">${esc(meta.note)}</p>` : ''}
      <dl class="mo-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${meta.href ? `<p class="mo-dl-link"><a class="text-link" href="${esc(meta.href)}">View this file (JSON) ↗</a></p>` : ''}`;
  }

  function renderTables() {
    el.tables.innerHTML = S.reps.map(([r, b]) => {
      const hyperKep = r === 'KEP' && !(b.values[0] > 0);
      return `<div class="mo-table-wrap"><table class="mo-table"><caption>${REP_NAMES[r]}</caption>
        <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">± 1σ</th><th scope="col">Unit</th></tr></thead><tbody>
        ${b.names.map((n, i) => `<tr><th scope="row">${esc(LABELS[n] || n)}</th><td>${esc(val(b.values[i]))}</td><td>${esc(unc(b.unc[i]))}</td><td>${esc(UNITS[n] ?? '')}</td></tr>`).join('')}
        </tbody></table>${hyperKep ? '<p class="mo-cap">Not defined for a hyperbolic orbit (the file gives zeros).</p>' : ''}</div>`;
    }).join('');
    // the conversion check
    const com = block(S.o, 'COM'), kep = block(S.o, 'KEP');
    const ang = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const parts = [];
    if (com) {
      const dq = Math.abs(S.conv.COM[0] / com.values[0] - 1), da = Math.max(...[2, 3, 4].map((i) => ang(S.conv.COM[i], com.values[i])));
      parts.push(`the file’s q to ${sci(Math.max(dq, 1e-15))} (relative) and its angles to ${sci(Math.max(da, 1e-15))}°`);
    }
    if (kep && S.conv.KEP && kep.values[0] > 0) parts.push(`its a to ${sci(Math.max(Math.abs(S.conv.KEP[0] / kep.values[0] - 1), 1e-15))}`);
    el.check.textContent = parts.length ? `Converting the Cartesian state on this page reproduces ${parts.join(', and ')}.` : '';
  }

  function renderCorr() {
    const rep = document.querySelector('input[name="mo-rep"]:checked').value;
    const b = block(S.o, rep);
    const { ctx, w, h } = fit(el.corr);
    if (!b || !b.C) { ctx.fillStyle = COLORS.text; ctx.font = '13px system-ui'; ctx.fillText('No covariance for this element set.', 16, 24); el.corrRead.textContent = ''; return; }
    const R = correlation(b.C), n = b.n;
    const lab = b.names.map((x) => (LABELS[x] || x).split(' ')[0]);
    const L = 64, T = 30, size = Math.min(w - L - 10, h - T - 10), cs = size / n;
    ctx.font = '12px system-ui, sans-serif';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const r = R[i][j], a = Math.min(1, Math.abs(r));
      ctx.fillStyle = r >= 0 ? `rgba(6,122,131,${a})` : `rgba(214,106,22,${a})`;
      ctx.fillRect(L + j * cs, T + i * cs, cs - 1, cs - 1);
      if (cs > 34) { ctx.fillStyle = a > 0.55 ? '#fff' : COLORS.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.toFixed(2).replace('-', '−'), L + (j + 0.5) * cs, T + (i + 0.5) * cs); }
    }
    ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) { ctx.textAlign = 'right'; ctx.fillText(lab[i], L - 6, T + (i + 0.5) * cs); ctx.textAlign = 'center'; ctx.fillText(lab[i], L + (i + 0.5) * cs, T - 12); }
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([Math.abs(R[i][j]), i, j]);
    pairs.sort((p, q) => q[0] - p[0]);
    const say = ([, i, j]) => `${LABELS[b.names[i]] || b.names[i]} and ${LABELS[b.names[j]] || b.names[j]} (${R[i][j].toFixed(3).replace('-', '−')})`;
    el.corr.setAttribute('aria-label', `Correlation matrix of the ${REP_NAMES[rep]} parameters; the strongest correlation is between ${say(pairs[0])}.`);
    el.corrRead.innerHTML = `Teal is positive, orange negative. The most strongly correlated pairs are ${pairs.slice(0, 3).map((p) => `<b>${esc(say(p))}</b>`).join(', ')}. `
      + (pairs[0][0] > 0.95 ? 'A correlation this close to ±1 means the data pin down a combination of the two far better than either one alone: treating the uncertainties as independent would badly misjudge how well the orbit is known.'
        : pairs[0][0] > 0.5 ? 'Correlations this large matter: treating the uncertainties as independent would misjudge how well the orbit is known.'
        : 'These are small: here the uncertainties are close to independent.');
  }

  function renderCloud() {
    const ty = Number(el.t.value), dt = ty * YEAR;
    el.tOut.textContent = `${ty >= 0 ? '+' : '−'}${Math.abs(ty).toFixed(2)} yr (${mjdToDate(S.epoch + dt)})`;
    const nom = propagate(S.nominal, dt);
    const cl = S.clones ? S.clones.map((c) => propagate(c, dt)) : [];
    // orbit view
    {
      const { ctx, w, h } = fit(el.orbit);
      const el0 = stateToElements(S.nominal, S.epoch), e = el0.COM[1], q = el0.COM[0];
      const Q = e < 1 ? q * (1 + e) / (1 - e) : Infinity;
      const rNow = Math.hypot(nom[0], nom[1]);
      const ext = 1.15 * Math.max(1.6, Q < 50 ? Q : 0, rNow);
      const s = (Math.min(w, h) / 2 - 10) / ext, cx = w / 2, cy = h / 2;
      const P = (x, y) => [cx + x * s, cy - y * s];
      ctx.strokeStyle = COLORS.axis; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      // the nominal orbit: one period, or +-the slider range for a hyperbola
      ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 1.5; ctx.beginPath();
      const span = e < 1 ? 2 * Math.PI * Math.sqrt((q / (1 - e)) ** 3 / GM) : 40 * YEAR;
      for (let k = 0; k <= 400; k++) { const p = propagate(S.nominal, (e < 1 ? 0 : -span / 2) + (k / 400) * span); const [X, Y] = P(p[0], p[1]); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.lineWidth = 1;
      dot(ctx, cx, cy, 5, '#e9a160');
      for (const c of cl) { const [X, Y] = P(c[0], c[1]); dot(ctx, X, Y, 1.2, 'rgba(196,22,12,0.35)'); }
      const [X, Y] = P(nom[0], nom[1]); dot(ctx, X, Y, 4, COLORS.ink);
      ctx.fillStyle = COLORS.text; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${ext >= 10 ? Math.round(ext) : ext.toFixed(1)} au to edge`, 8, 8);
    }
    // the clone cloud in the RTN frame
    const { ctx, w, h } = fit(el.cloud);
    if (!S.clones) {
      ctx.fillStyle = COLORS.text; ctx.font = '13px system-ui'; ctx.fillText('This file has no usable Cartesian covariance.', 16, 24);
      el.cloudRead.textContent = ''; drawGrowth(ty); return;
    }
    const d = rtn(nom, cl);
    const sd = (k) => Math.sqrt(d.reduce((s, x) => s + x[k] * x[k], 0) / d.length);
    const [sR, sT, sN] = [sd(0), sd(1), sd(2)];
    let ext = 3.5 * Math.max(sR, sT, 1e-6), unit = 'km', k = 1;
    if (ext > 0.1 * AU_KM) { unit = 'au'; k = 1 / AU_KM; } else if (ext < 1) { unit = 'm'; k = 1000; }
    ext *= k;
    const aspect = w / h;
    const f = frame(ctx, w, h, { x0: -ext * Math.max(1, aspect * 0.86), x1: ext * Math.max(1, aspect * 0.86), y0: -ext, y1: ext, xlabel: `along the orbit (${unit})`, ylabel: `radial (${unit})`, left: 58 });
    f.clip();
    for (const x of d) dot(ctx, f.X(x[1] * k), f.Y(x[0] * k), 1.6, 'rgba(196,22,12,0.45)');
    dot(ctx, f.X(0), f.Y(0), 3.5, COLORS.ink);
    ctx.restore();
    const arcsec = (km) => (km / AU_KM) * 206264.8;
    el.cloudRead.textContent = `On ${mjdToDate(S.epoch + dt)} the clones are spread by ${len(sT)} along the orbit, ${len(sR)} radially and ${len(sN)} across it (1σ). Seen from 1 au away, ${len(sT)} would be ${arcsec(sT) >= 1 ? fmt(arcsec(sT), arcsec(sT) < 10 ? 1 : 0) + '″' : Number((arcsec(sT) * 1000).toPrecision(2)) + ' milliarcseconds'} on the sky.`;
    el.cloud.setAttribute('aria-label', `The ${N_CLONES} clones around the best-fit position: 1-sigma spread ${len(sT)} along the orbit and ${len(sR)} radially.`);
    drawGrowth(ty);
  }

  function drawGrowth(ty) {
    const { ctx, w, h } = fit(el.growth);
    if (!S.growth) return;
    const all = S.growth.flat().filter((v) => v > 0);
    let lo = Math.min(...all), hi = Math.max(...all);
    lo = 10 ** Math.floor(Math.log10(lo)); hi = 10 ** Math.ceil(Math.log10(hi));
    const f = frame(ctx, w, h, { x0: -20, x1: 20, y0: lo, y1: hi, ylog: true, xlabel: 'years from the epoch', ylabel: '1σ spread (km)', yfmt: logLabel, left: 58,
      yticks: hi / lo > 1e4 ? Array.from({ length: Math.round(Math.log10(hi / lo)) + 1 }, (_, i) => lo * 10 ** i) : undefined });
    f.clip();
    const cols = ['#c4160c', COLORS.teal, '#8a6bb5'], names = ['along the orbit', 'radial', 'across the orbit'];
    for (const [ci, kk] of [[0, 1], [1, 0], [2, 2]]) {
      ctx.strokeStyle = cols[ci]; ctx.lineWidth = 2; ctx.beginPath();
      S.growth.forEach((g, i) => { const v = Math.max(g[kk], lo); const X = f.X(T_GRID[i]), Y = f.Y(v); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(f.X(ty), f.T); ctx.lineTo(f.X(ty), f.T + f.ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(f.L + 6, f.T + 4, 128, 56);
    names.forEach((n, i) => { ctx.fillStyle = cols[i]; ctx.fillRect(f.L + 12, f.T + 12 + i * 17, 14, 3); ctx.fillStyle = COLORS.ink; ctx.fillText(n, f.L + 32, f.T + 13 + i * 17); });
  }

  async function loadSample(key) {
    const meta = index.find((s) => s.key === key);
    try {
      const res = await fetch(`${BASE}${key}.json`);
      setOrbit(await res.json(), { ...meta, href: `${BASE}${key}.json` });
    } catch (err) { showError(`Could not load the sample orbit (${err.message}).`); }
  }

  async function init() {
    index = await (await fetch(`${BASE}index.json`)).json();
    index.forEach((s, i) => {
      const lab = document.createElement('label');
      lab.innerHTML = `<input type="radio" name="mo-sample" value="${esc(s.key)}" ${i === 0 ? 'checked' : ''} /><span>${esc(s.label)}</span>`;
      el.samples.append(lab);
    });
    el.samples.addEventListener('change', (e) => loadSample(e.target.value));
    el.file.addEventListener('change', async () => {
      const file = el.file.files?.[0];
      if (!file) return;
      try { const json = JSON.parse(await file.text()); uncheck(); setOrbit(json, { note: `From your file ${file.name}.` }); }
      catch (err) { showError(`Could not read ${file.name}: ${err.message}`); }
    });
    el.go.addEventListener('click', () => {
      try { const json = JSON.parse(el.text.value); uncheck(); setOrbit(json, { note: 'From the JSON you pasted.' }); }
      catch (err) { showError(`Could not read the pasted text: ${err.message}`); }
    });
    document.querySelectorAll('input[name="mo-rep"]').forEach((r) => r.addEventListener('change', () => S && renderCorr()));
    el.t.addEventListener('input', () => S && renderCloud());
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (S) { renderCorr(); renderCloud(); } }); });
    await loadSample(index[0].key);
  }
  const uncheck = () => document.querySelectorAll('input[name="mo-sample"]').forEach((r) => { r.checked = false; });
  init();
}
