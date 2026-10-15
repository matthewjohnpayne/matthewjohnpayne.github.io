// Blastroids: an Asteroids-style game in which everything orbits the Sun.
//
// The ship, the asteroids, the shots and the fragments all move under the Sun's
// gravity (inverse-square, integrated with a kick-drift-kick leapfrog), so thrusting
// changes your orbit rather than simply pushing you along. A dotted line shows the
// path you are on. Shattered asteroids conserve momentum.
//
// startBlastroids(container, { onExit, compact, onToggleSize }) builds the game inside container
// and returns { destroy, setExpanded }. compact: a small window (shorter start text, larger ship
// sprite); onToggleSize: shows an Expand/Shrink button and is called when it is pressed (or Esc
// while expanded). Nothing moves until the player starts; the game pauses when the tab is
// hidden. Keyboard: arrows or WASD to steer and thrust, Space to fire, P to pause,
// O to toggle the orbit line, Esc to quit. On touch screens, on-screen buttons appear.

const GM = 4.9e6;              // world units^3 / s^2: a circular orbit at r = 200 takes about 8 s
const SUN_R = 11;              // the Sun's radius: drawn with a glow three times this, and the collision radius
const WORLD = 1000;            // the view spans about this many world units across its shorter side
const ESCAPE_R = 1000;          // beyond this (about twice the view) a body has left for good
const DT = 1 / 240;
const SIZES = [{ r: 34, pts: 20 }, { r: 20, pts: 50 }, { r: 11, pts: 100 }];
const SHIP = { r: 9, thrust: 55, turn: 3.6, shot: 340, shotLife: 2.4, maxShots: 6, reload: 0.18 };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function accel(x, y) {
  const r2 = x * x + y * y, r = Math.sqrt(r2), f = -GM / (r2 * r);
  return [f * x, f * y];
}

/** Position and velocity on an orbit with semi-major axis a, eccentricity e, orientation w,
 * at true anomaly f; dir = +1 anticlockwise, -1 clockwise. */
function orbitState(a, e, w, f, dir) {
  const p = a * (1 - e * e), r = p / (1 + e * Math.cos(f)), h = Math.sqrt(GM * p);
  const xo = r * Math.cos(f), yo = r * Math.sin(f);
  const vxo = -GM / h * Math.sin(f), vyo = GM / h * (e + Math.cos(f));
  const c = Math.cos(w), s = Math.sin(w);
  return { x: c * xo - s * yo, y: dir * (s * xo + c * yo), vx: c * vxo - s * vyo, vy: dir * (s * vxo + c * vyo) };
}

function stepBody(b, dt) {
  // kick-drift-kick leapfrog in the Sun's field
  let [ax, ay] = accel(b.x, b.y);
  b.vx += 0.5 * dt * ax; b.vy += 0.5 * dt * ay;
  b.x += dt * b.vx; b.y += dt * b.vy;
  [ax, ay] = accel(b.x, b.y);
  b.vx += 0.5 * dt * ax; b.vy += 0.5 * dt * ay;
}

export function startBlastroids(container, { onExit = null, compact = false, onToggleSize = null } = {}) {
  let expanded = false;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.classList.add('bl-root');
  container.classList.toggle('bl-compact', compact);
  container.innerHTML = `
    <div class="bl-stage"><canvas class="bl-canvas" tabindex="0" role="application" aria-label="Blastroids game. Arrow keys or W A S D to steer and thrust, Space to fire, P to pause, O to show or hide your orbit, Escape to quit."></canvas>
      <div class="bl-overlay" role="dialog" aria-live="polite"></div>
      <div class="bl-touch" aria-hidden="true">
        <button type="button" data-k="left">◀</button><button type="button" data-k="right">▶</button>
        <button type="button" data-k="thrust">▲</button><button type="button" data-k="fire">●</button>
      </div>
    </div>
    <div class="bl-bar">
      <span class="bl-hud" aria-live="polite"></span>
      <span class="bl-buttons"><button type="button" class="bl-pause">Pause</button>${onToggleSize ? '<button type="button" class="bl-size" aria-label="Expand the game to a bigger window">Expand ⤢</button>' : ''}${onExit ? '<button type="button" class="bl-quit">Quit</button>' : ''}</span>
    </div>`;
  const canvas = container.querySelector('.bl-canvas'), overlay = container.querySelector('.bl-overlay');
  const hud = container.querySelector('.bl-hud'), pauseBtn = container.querySelector('.bl-pause');
  const ctx = canvas.getContext('2d');
  const rnd = mulberry(Date.now() & 0xffffffff);

  let best = 0;
  try { best = Number(localStorage.getItem('blastroids-best')) || 0; } catch (e) { /* storage unavailable */ }
  const stars = Array.from({ length: 160 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, b: 0.3 + 0.7 * rnd() }));

  const keys = { left: false, right: false, thrust: false, fire: false };
  let state = 'title', ship = null, rocks = [], shots = [], sparks = [], score = 0, lives = 3, wave = 0;
  let showOrbit = true, reload = 0, respawn = 0, invuln = 0, last = 0, acc = 0, raf = 0, message = '';

  function newShip() {
    const s = orbitState(240, 0, Math.PI / 2, 0, 1);
    ship = { ...s, ang: Math.atan2(s.vy, s.vx), alive: true };
    invuln = 2.5;
  }
  function rockShape(size) {
    const n = 9 + Math.floor(rnd() * 4);
    return Array.from({ length: n }, (_, k) => ({ a: (k / n) * 2 * Math.PI, r: SIZES[size].r * (0.72 + 0.4 * rnd()) }));
  }
  function startWave() {
    wave += 1;
    rocks = [];
    for (let k = 0; k < 2 + wave; k++) {
      // orbits that stay inside the view (aphelion below about 460), starting away from the ship
      let st;
      do {
        const a = 160 + 200 * rnd(), e = Math.min(0.3 * rnd(), 460 / a - 1), dir = rnd() < 0.8 ? 1 : -1;   // a few go the "wrong" way round
        st = orbitState(a, e, 2 * Math.PI * rnd(), 2 * Math.PI * rnd(), dir);
      } while (ship && Math.hypot(st.x - ship.x, st.y - ship.y) < 180);
      rocks.push({ ...st, size: 0, shape: rockShape(0), spin: (rnd() - 0.5) * 2, rot: 0 });
    }
    message = `Wave ${wave}`;
    setTimeout(() => { if (message === `Wave ${wave}`) message = ''; }, 1600);
  }
  function newGame() {
    score = 0; lives = 3; wave = 0; shots = []; sparks = [];
    newShip(); startWave();
    state = 'play'; overlay.hidden = true; canvas.focus();
  }
  function burst(x, y, vx, vy, n, colour) {
    if (reduced) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * rnd(), s = 30 + 90 * rnd();
      sparks.push({ x, y, vx: vx + s * Math.cos(a), vy: vy + s * Math.sin(a), life: 0.5 + 0.5 * rnd(), colour });
    }
  }
  function split(rock, shot) {
    score += SIZES[rock.size].pts;
    burst(rock.x, rock.y, rock.vx, rock.vy, 14, '#d8c3a5');
    if (rock.size >= SIZES.length - 1) return [];
    // two fragments with equal and opposite kicks perpendicular to the shot: momentum is conserved
    const ux = shot.vx - rock.vx, uy = shot.vy - rock.vy, un = Math.hypot(ux, uy) || 1;
    const px = -uy / un, py = ux / un, kick = 35 + 25 * rnd();
    return [1, -1].map((sgn) => ({ x: rock.x + sgn * px * 6, y: rock.y + sgn * py * 6, vx: rock.vx + sgn * kick * px, vy: rock.vy + sgn * kick * py,
      size: rock.size + 1, shape: rockShape(rock.size + 1), spin: (rnd() - 0.5) * 3, rot: 0 }));
  }

  function update(dt) {
    if (ship.alive) {
      if (keys.left) ship.ang -= SHIP.turn * dt;
      if (keys.right) ship.ang += SHIP.turn * dt;
      if (keys.thrust) { ship.vx += SHIP.thrust * Math.cos(ship.ang) * dt; ship.vy += SHIP.thrust * Math.sin(ship.ang) * dt; }
      stepBody(ship, dt);
      reload -= dt; invuln -= dt;
      if (keys.fire && reload <= 0 && shots.length < SHIP.maxShots) {
        reload = SHIP.reload;
        const c = Math.cos(ship.ang), s = Math.sin(ship.ang);
        shots.push({ x: ship.x + c * SHIP.r, y: ship.y + s * SHIP.r, vx: ship.vx + SHIP.shot * c, vy: ship.vy + SHIP.shot * s, life: SHIP.shotLife });
      }
      const r = Math.hypot(ship.x, ship.y);
      if (r < SUN_R + SHIP.r * 0.5 || r > ESCAPE_R) loseShip(r < SUN_R + 10 ? 'Burnt up in the Sun' : 'Escaped the Solar System');
    } else if ((respawn -= dt) <= 0 && lives > 0) newShip();

    for (const s of shots) { stepBody(s, dt); s.life -= dt; }
    shots = shots.filter((s) => s.life > 0 && Math.hypot(s.x, s.y) > SUN_R);
    for (const k of rocks) { stepBody(k, dt); k.rot += k.spin * dt; }
    rocks = rocks.filter((k) => { const r = Math.hypot(k.x, k.y); if (r < SUN_R + SIZES[k.size].r * 0.5) { burst(k.x, k.y, 0, 0, 10, '#ffcf66'); return false; } return r < ESCAPE_R; });
    for (const p of sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    sparks = sparks.filter((p) => p.life > 0);

    // shots against rocks
    const born = [];
    for (const s of shots) {
      for (const k of rocks) {
        if (k.dead || s.life <= 0) continue;
        if (Math.hypot(s.x - k.x, s.y - k.y) < SIZES[k.size].r) { k.dead = true; s.life = 0; born.push(...split(k, s)); }
      }
    }
    rocks = rocks.filter((k) => !k.dead).concat(born);
    shots = shots.filter((s) => s.life > 0);
    // rocks against the ship
    if (ship.alive && invuln <= 0) {
      for (const k of rocks) if (Math.hypot(ship.x - k.x, ship.y - k.y) < SIZES[k.size].r + SHIP.r * 0.7) { loseShip('Hit by an asteroid'); break; }
    }
    if (!rocks.length && state === 'play') { score += 250 * wave; startWave(); }
  }
  function loseShip(why) {
    burst(ship.x, ship.y, ship.vx, ship.vy, 24, '#7fd6dc');
    ship.alive = false; lives -= 1; respawn = 2; message = why;
    setTimeout(() => { if (message === why) message = ''; }, 1800);
    if (lives <= 0) setTimeout(gameOver, 1500);
  }
  function gameOver() {
    state = 'over';
    if (score > best) { best = score; try { localStorage.setItem('blastroids-best', String(best)); } catch (e) { /* ignore */ } }
    showOverlay(`<h2>Game over</h2><p>Score ${score.toLocaleString('en')} · best ${best.toLocaleString('en')} · wave ${wave}</p><p><button type="button" class="bl-start">Play again</button></p>`);
  }

  // ---------------------------------------------------------------- drawing
  let view = { s: 1, cx: 0, cy: 0, w: 0, h: 0 };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { s: Math.min(w, h) / WORLD, cx: w / 2, cy: h / 2, w, h };
  }
  const X = (x) => view.cx + x * view.s, Y = (y) => view.cy + y * view.s;
  function draw() {
    const { w, h, s } = view;
    ctx.fillStyle = '#050a14'; ctx.fillRect(0, 0, w, h);
    for (const st of stars) { ctx.fillStyle = `rgba(255,255,255,${0.25 * st.b})`; ctx.fillRect(view.cx + st.x * w * 0.5, view.cy + st.y * h * 0.5, 1.2, 1.2); }
    const g = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), SUN_R * 3 * s);
    g.addColorStop(0, '#fff4c2'); g.addColorStop(0.35, '#ffcf66'); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(0), Y(0), SUN_R * 3 * s, 0, 2 * Math.PI); ctx.fill();
    if (!ship) return;
    // the ship's path: integrate a copy ballistically for up to one orbit or 8 s
    if (showOrbit && ship.alive && state === 'play') {
      const c = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
      const r0 = Math.hypot(c.x, c.y), v2 = c.vx * c.vx + c.vy * c.vy, en = v2 / 2 - GM / r0;
      const period = en < 0 ? 2 * Math.PI * Math.sqrt((-GM / (2 * en)) ** 3 / GM) : 8;
      const T = Math.min(period * 1.01, 12), n = 360, dt = T / n;
      ctx.strokeStyle = 'rgba(36,185,190,0.55)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(c.x), Y(c.y));
      for (let k = 0; k < n; k++) {
        for (let j = 0; j < 4; j++) stepBody(c, dt / 4);
        const r = Math.hypot(c.x, c.y);
        ctx.lineTo(X(c.x), Y(c.y));
        if (r < SUN_R || r > ESCAPE_R) break;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#d8c3a5'; ctx.lineWidth = 1.6;
    for (const k of rocks) {
      ctx.beginPath();
      k.shape.forEach((p, i) => { const a = p.a + k.rot, x = X(k.x + p.r * Math.cos(a)), y = Y(k.y + p.r * Math.sin(a)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (const sh of shots) { ctx.beginPath(); ctx.arc(X(sh.x), Y(sh.y), 1.8, 0, 2 * Math.PI); ctx.fill(); }
    for (const p of sparks) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.colour; ctx.fillRect(X(p.x) - 1, Y(p.y) - 1, 2, 2); }
    ctx.globalAlpha = 1;
    if (ship.alive && (invuln <= 0 || Math.floor(invuln * 8) % 2 === 0 || reduced)) {
      // in a small window, draw the ship larger than its collision size so that it stays visible
      const c = Math.cos(ship.ang), sn = Math.sin(ship.ang), R = SHIP.r * Math.max(1, 0.6 / view.s);
      const pt = (f, l) => [X(ship.x + c * f - sn * l), Y(ship.y + sn * f + c * l)];
      ctx.strokeStyle = invuln > 0 ? '#9fe7ea' : '#24b9be'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(...pt(R * 1.4, 0)); ctx.lineTo(...pt(-R, R * 0.85)); ctx.lineTo(...pt(-R * 0.55, 0)); ctx.lineTo(...pt(-R, -R * 0.85)); ctx.closePath(); ctx.stroke();
      if (keys.thrust) { ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(...pt(-R * 0.7, R * 0.4)); ctx.lineTo(...pt(-R * (1.6 + 0.5 * Math.random()), 0)); ctx.lineTo(...pt(-R * 0.7, -R * 0.4)); ctx.stroke(); }
    }
    if (message) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(message, w / 2, 40); }
    if (state === 'paused') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Paused: press P to continue', w / 2, h / 2 + 80); }
  }
  function updateHud() {
    let orbit = '';
    if (ship && ship.alive) {
      const r = Math.hypot(ship.x, ship.y), v2 = ship.vx ** 2 + ship.vy ** 2, en = v2 / 2 - GM / r;
      const hz = ship.x * ship.vy - ship.y * ship.vx, e = Math.sqrt(Math.max(0, 1 + 2 * en * hz * hz / GM ** 2));
      orbit = en < 0 ? ` · your orbit: e = ${e.toFixed(2)}${hz < 0 ? ' (clockwise)' : ''}` : ' · on an escape orbit!';
    }
    hud.textContent = `Score ${score.toLocaleString('en')} · ships ${Math.max(lives, 0)} · wave ${wave}${orbit}`;
  }

  // ---------------------------------------------------------------- the loop
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (state === 'play' || state === 'over') {
      acc += dt;
      while (acc >= DT) { if (state === 'play' || ship) update(DT); acc -= DT; }
    }
    draw();
    if (Math.floor(t / 250) !== Math.floor((t - dt * 1000) / 250)) updateHud();
  }
  function showOverlay(html) { overlay.innerHTML = html; overlay.hidden = false; const b = overlay.querySelector('.bl-start'); if (b) { b.addEventListener('click', newGame); b.focus(); } }
  function pause(on) {
    if (state !== 'play' && state !== 'paused') return;
    state = on ? 'paused' : 'play'; pauseBtn.textContent = on ? 'Resume' : 'Pause';
    if (!on) { last = 0; canvas.focus(); }
  }

  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'thrust', w: 'thrust', W: 'thrust', ' ': 'fire' };
  // Keys that would otherwise scroll the page; Down (and S) deliberately do nothing in the game:
  // to slow down, turn round and thrust.
  const NO_SCROLL = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End']);
  function onKey(ev, down) {
    const inGame = state === 'play' || state === 'paused';
    if (inGame && NO_SCROLL.has(ev.key)) ev.preventDefault();
    if (ev.key in KEYMAP && state === 'play') { keys[KEYMAP[ev.key]] = down; return; }
    if (!down) return;
    if (ev.key === 'p' || ev.key === 'P') { pause(state === 'play'); ev.preventDefault(); }
    else if (ev.key === 'o' || ev.key === 'O') showOrbit = !showOrbit;
    else if (ev.key === 'Escape') { if (expanded && onToggleSize) onToggleSize(); else if (onExit) { destroy(); onExit(); } else pause(true); }
    else if (ev.key === 'Enter' && state !== 'play' && state !== 'paused') { newGame(); ev.preventDefault(); }
  }
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  container.addEventListener('keydown', kd);
  container.addEventListener('keyup', ku);
  const vis = () => { if (document.hidden) pause(true); };
  document.addEventListener('visibilitychange', vis);
  pauseBtn.addEventListener('click', () => pause(state === 'play'));
  const sizeBtn = container.querySelector('.bl-size');
  if (sizeBtn) sizeBtn.addEventListener('click', () => onToggleSize());
  const quit = container.querySelector('.bl-quit');
  if (quit) quit.addEventListener('click', () => { destroy(); onExit(); });
  container.querySelectorAll('.bl-touch button').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, () => { keys[k] = false; }));
  });
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const intro = compact
    ? `<h2>Blastroids</h2><p>Everything here orbits the Sun, including you. Thrust to change your orbit; the dotted line shows where you are heading.</p>
    <p class="bl-keys">← →: turn · ↑: thrust · Space: fire · P: pause</p>
    <p><button type="button" class="bl-start">Start (Enter)</button></p>`
    : null;
  if (intro) showOverlay(intro + (best ? `<p class="bl-best">Best on this device: ${best.toLocaleString('en')}</p>` : ''));
  else showOverlay(`<h2>Blastroids</h2>
    <p>Everything here orbits the Sun, including you. Thrust along your direction of motion and the far side of your orbit rises; thrust against it and you fall inwards. Shots and fragments orbit too, so a shot fired ahead may come back round. The dotted line shows the path you are on.</p>
    <p class="bl-keys">← → or A D: turn · ↑ or W: thrust · Space: fire · P: pause · O: orbit line · Esc: quit</p>
    <p><button type="button" class="bl-start">Start (Enter)</button></p>
    ${best ? `<p class="bl-best">Best score on this device: ${best.toLocaleString('en')}</p>` : ''}`);
  resize();
  raf = requestAnimationFrame(frame);

  function destroy() {
    cancelAnimationFrame(raf); ro.disconnect();
    document.removeEventListener('visibilitychange', vis);
    container.removeEventListener('keydown', kd); container.removeEventListener('keyup', ku);
    container.innerHTML = ''; container.classList.remove('bl-root');
  }
  function setExpanded(on) {
    expanded = on;
    container.classList.toggle('bl-expanded', on);
    if (sizeBtn) { sizeBtn.textContent = on ? 'Shrink ⤡' : 'Expand ⤢'; sizeBtn.setAttribute('aria-label', on ? 'Return the game to the small window' : 'Expand the game to a bigger window'); }
    resize();
    canvas.focus();
  }
  return { destroy, setExpanded };
}
