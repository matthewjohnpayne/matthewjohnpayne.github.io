// Kepleroids: an Asteroids-style game in which everything orbits the Sun.
//
// The ship, the asteroids, the shots and the fragments all move under the Sun's
// gravity (inverse-square, integrated with a kick-drift-kick leapfrog), so thrusting
// changes your orbit rather than simply pushing you along. A dotted line shows the
// path you are on. Shattered asteroids conserve momentum.
//
// In wave 2 an interstellar spacecraft, Rama (after Arthur C. Clarke), passes through on a
// hyperbolic orbit, and again once in each later wave until it has been hit. Hit it and it releases a pod that brakes into an orbit about the Sun (see
// POD); match orbits with the pod to collect twin guns (two shots side by side, reloading twice as
// fast) for as long as that ship survives. Rama arrives unannounced: players find out what it
// does by trying.
//
// In wave 3 the Sun is replaced by a binary star of the same total mass (see BINARY): two stars on
// a circular orbit about the centre, whose changing pull makes orbits close in precess and wander.
// In later waves the centre is at random a single star or a binary of random separation and mass
// ratio.
//
// startKepleroids(container, { onExit, compact, onToggleSize }) builds the game inside container
// and returns { destroy, setExpanded }. compact: a small window (shorter start text, larger ship
// sprite); onToggleSize: shows an Expand/Shrink button and is called when it is pressed (or Esc
// while expanded). Nothing moves until the player starts; the game pauses when the tab is
// hidden. Keyboard: arrows or WASD to steer and thrust, Space to fire, P to pause,
// O to toggle the orbit line, Esc to quit. On touch screens, on-screen buttons appear.
// For testing: add ?wave=N to the page address to start each game at wave N; while the address has
// ?wave, the N key also skips to the next wave.

const GM = 4.9e6;              // world units^3 / s^2: a circular orbit at r = 200 takes about 8 s
const SUN_R = 11;              // the Sun's radius: drawn with a glow three times this, and the collision radius
const WORLD = 1000;            // the view spans about this many world units across its shorter side
const ESCAPE_R = 1000;          // beyond this (about twice the view) a body has left for good
const DT = 1 / 240;
const SIZES = [{ r: 34, pts: 20 }, { r: 20, pts: 50 }, { r: 11, pts: 100 }];
const SHIP = { r: 9, thrust: 55, turn: 3.6, shot: 340, shotLife: 2.4, maxShots: 6, reload: 0.18 };
const TWIN = { maxShots: 14, reload: 0.09, gap: 4 };   // twin guns: shot limit, reload (s), half-separation of the barrels
// Rama: a cylinder (length L, diameter D) on a hyperbolic orbit with perihelion q and eccentricity
// e, arriving at a random time between delay[0] and delay[1] seconds (on average 20 s) into wave
// `wave` and each later wave until hit (not at all in a wave cleared sooner), from radius `start`. The pod it releases has radius r and
// brakes to a circular orbit if it is within rp of the Sun, otherwise to an ellipse with aphelion at
// the release point and perihelion rp, so that it always comes back through the middle of the view.
const RAMA = { wave: 2, delay: [10, 30], L: 46, D: 16, q: [170, 260], e: [1.3, 1.6], start: 970 };
const POD = { r: 7, rp: 250 };
// The binary star: in wave `first`, separation a and mass ratio q (secondary/primary); after it, a
// binary with probability `chance`, separation in aRange and mass ratio in qRange. Its period is
// 2π√(a³/GM): 2.4 s at a = 90. The primary is drawn with radius r (also the collision radius), the
// secondary smaller, as R ∝ M^0.8 for main-sequence stars. Orbits around a binary are stable only
// beyond roughly 2–2.5 separations (Holman & Wiegert 1999), so asteroids keep their perihelia
// beyond `stable` separations.
const BINARY = { first: 3, a: 90, q: 0.5, chance: 0.5, aRange: [50, 90], qRange: [0.25, 1], r: 10, stable: 2.6 };

// The central mass: a single star at the origin or, while `binary` is set, a binary of separation a,
// mass ratio q and angular speed n about the origin. `t` is the game clock that sets its phase.
const field = { binary: false, t: 0, a: BINARY.a, q: BINARY.q, n: 0 };
function setCentre(binary, a = BINARY.a, q = BINARY.q) {
  Object.assign(field, { binary, a, q, n: Math.sqrt(GM / a ** 3) });
}
/** The star or stars at time t: positions, fractions of the total mass, and radii. */
function starsAt(t) {
  if (!field.binary) return [{ x: 0, y: 0, m: 1, r: SUN_R }];
  const mu = field.q / (1 + field.q), c = Math.cos(field.n * t) * field.a, s = Math.sin(field.n * t) * field.a;
  return [{ x: -mu * c, y: -mu * s, m: 1 - mu, r: BINARY.r }, { x: (1 - mu) * c, y: (1 - mu) * s, m: mu, r: Math.max(5, BINARY.r * field.q ** 0.8) }];
}
/** Whether (x, y) is within pad of a star's surface at time t. */
const hitStar = (x, y, pad, t = field.t) => starsAt(t).some((st) => Math.hypot(x - st.x, y - st.y) < st.r + pad);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function accel(x, y, t) {
  let ax = 0, ay = 0;
  for (const st of starsAt(t)) {
    const dx = x - st.x, dy = y - st.y, r2 = dx * dx + dy * dy, f = -GM * st.m / (r2 * Math.sqrt(r2));
    ax += f * dx; ay += f * dy;
  }
  return [ax, ay];
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

function stepBody(b, dt, t = field.t) {
  // kick-drift-kick leapfrog in the field of the star(s), from time t to t + dt
  let [ax, ay] = accel(b.x, b.y, t);
  b.vx += 0.5 * dt * ax; b.vy += 0.5 * dt * ay;
  b.x += dt * b.vx; b.y += dt * b.vy;
  [ax, ay] = accel(b.x, b.y, t + dt);
  b.vx += 0.5 * dt * ax; b.vy += 0.5 * dt * ay;
}

export function startKepleroids(container, { onExit = null, compact = false, onToggleSize = null } = {}) {
  let expanded = false;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.classList.add('bl-root');
  container.classList.toggle('bl-compact', compact);
  container.innerHTML = `
    <div class="bl-stage"><canvas class="bl-canvas" tabindex="0" role="application" aria-label="Kepleroids game. Arrow keys or W A S D to steer and thrust, Space to fire, P to pause, O to show or hide your orbit, Escape to quit."></canvas>
      <div class="bl-overlay" role="dialog" aria-label="Kepleroids" aria-live="polite"></div>
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

  // testing: ?wave=N starts each game at wave N, and enables the N key (next wave)
  const testWave = (() => { try { const v = new URLSearchParams(location.search).get('wave'); return v === null ? 0 : Math.max(1, Math.floor(Number(v)) || 1); } catch (e) { return 0; } })();
  let best = 0;
  try { best = Number(localStorage.getItem('kepleroids-best')) || 0; } catch (e) { /* storage unavailable */ }
  const stars = Array.from({ length: 160 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, b: 0.3 + 0.7 * rnd() }));

  const keys = { left: false, right: false, thrust: false, fire: false };
  let state = 'title', ship = null, rocks = [], shots = [], sparks = [], score = 0, lives = 3, wave = 0;
  let showOrbit = true, reload = 0, respawn = 0, invuln = 0, last = 0, acc = 0, raf = 0, message = '';
  // ramaTimer: seconds until Rama arrives (< 0: not due); ramaHit: Rama has been hit this game
  let rama = null, pod = null, ramaTimer = -1, ramaHit = false;

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
    const lerp = ([lo, hi]) => lo + (hi - lo) * rnd();
    if (wave === BINARY.first) setCentre(true);
    else if (wave > BINARY.first && rnd() < BINARY.chance) setCentre(true, lerp(BINARY.aRange), lerp(BINARY.qRange));
    else setCentre(false);
    rocks = [];
    // around a binary, perihelia beyond the stability limit
    const qMin = field.binary ? BINARY.stable * field.a : 0, aMin = Math.max(160, qMin + 20);
    for (let k = 0; k < 2 + wave; k++) {
      // orbits that stay inside the view (aphelion below about 460), starting away from the ship
      let st;
      do {
        const a = aMin + (360 - aMin) * rnd();
        const e = Math.min(0.3 * rnd(), 460 / a - 1, 1 - qMin / a), dir = rnd() < 0.8 ? 1 : -1;   // a few go the "wrong" way round
        st = orbitState(a, e, 2 * Math.PI * rnd(), 2 * Math.PI * rnd(), dir);
      } while (ship && Math.hypot(st.x - ship.x, st.y - ship.y) < 180);
      rocks.push({ ...st, size: 0, shape: rockShape(0), spin: (rnd() - 0.5) * 2, rot: 0 });
    }
    if (wave >= RAMA.wave && !ramaHit) ramaTimer = RAMA.delay[0] + (RAMA.delay[1] - RAMA.delay[0]) * rnd();
    message = `Wave ${wave}`;
    setTimeout(() => { if (message === `Wave ${wave}`) message = ''; }, 1600);
  }
  function newGame() {
    score = 0; lives = 3; wave = 0; setCentre(false); field.t = 0; shots = []; sparks = []; rama = null; pod = null; ramaTimer = -1; ramaHit = false;
    if (testWave) wave = testWave - 1;
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

  function launchRama() {
    // inbound on a hyperbola: r = p / (1 + e cos f), starting where r = RAMA.start, before perihelion
    const q = RAMA.q[0] + (RAMA.q[1] - RAMA.q[0]) * rnd(), e = RAMA.e[0] + (RAMA.e[1] - RAMA.e[0]) * rnd();
    const p = q * (1 + e), f = -Math.acos((p / RAMA.start - 1) / e);
    rama = { ...orbitState(q / (1 - e), e, 2 * Math.PI * rnd(), f, rnd() < 0.5 ? 1 : -1), hit: false, spin: 0 };
  }
  /** Rama's frame: distance along its axis (which points along its motion) and across it. */
  function ramaFrame(x, y) {
    const v = Math.hypot(rama.vx, rama.vy) || 1, ux = rama.vx / v, uy = rama.vy / v, dx = x - rama.x, dy = y - rama.y;
    return [dx * ux + dy * uy, -dx * uy + dy * ux];
  }
  const touchesRama = (x, y, pad) => { const [a, c] = ramaFrame(x, y); return Math.abs(a) < RAMA.L / 2 + pad && Math.abs(c) < RAMA.D / 2 + pad; };
  function releasePod(shot) {
    // the pod leaves where the shot struck and brakes at once to a tangential speed (vis-viva at
    // aphelion r with perihelion rp), going round in the same sense as Rama
    rama.hit = ramaHit = true;
    const x = shot.x, y = shot.y, r = Math.hypot(x, y), rp = Math.min(r, POD.rp);
    const v = Math.sqrt(2 * GM * rp / (r * (r + rp))), dir = Math.sign(rama.x * rama.vy - rama.y * rama.vx) || 1;
    pod = { x, y, vx: -dir * v * y / r, vy: dir * v * x / r, age: 0 };
    burst(x, y, rama.vx, rama.vy, 12, '#ffd36b');
  }
  function collectPod() {
    pod = null; ship.twin = true;
    burst(ship.x, ship.y, ship.vx, ship.vy, 16, '#ffd36b');
    flash('Twin guns: two shots at a time, reloading twice as fast', 2600);
  }

  // the part of the world currently on screen, in world units
  const inView = (x, y, pad = 0) => Math.abs(x) < view.cx / view.s + pad && Math.abs(y) < view.cy / view.s + pad;
  const energy = (b) => 0.5 * (b.vx * b.vx + b.vy * b.vy) - GM / Math.hypot(b.x, b.y);
  /** Seconds until a body re-enters the view, by integrating a copy of its orbit (up to 60 s). */
  function returnTime(b) {
    const c = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }, h = 1 / 30;
    for (let t = h; t < 60; t += h) {
      stepBody(c, h, field.t + t - h);
      if (inView(c.x, c.y)) return t;
    }
    return Infinity;
  }
  function flash(text, ms = 1800) {
    message = text;
    setTimeout(() => { if (message === text) message = ''; }, ms);
  }
  let lookahead = 0;

  function update(dt) {
    if (ship.alive) {
      if (keys.left) ship.ang -= SHIP.turn * dt;
      if (keys.right) ship.ang += SHIP.turn * dt;
      if (keys.thrust) { ship.vx += SHIP.thrust * Math.cos(ship.ang) * dt; ship.vy += SHIP.thrust * Math.sin(ship.ang) * dt; }
      stepBody(ship, dt);
      reload -= dt; invuln -= dt;
      const barrels = ship.twin ? [-TWIN.gap, TWIN.gap] : [0];
      if (keys.fire && reload <= 0 && shots.length + barrels.length <= (ship.twin ? TWIN.maxShots : SHIP.maxShots)) {
        reload = ship.twin ? TWIN.reload : SHIP.reload;
        const c = Math.cos(ship.ang), s = Math.sin(ship.ang);
        for (const g of barrels) shots.push({ x: ship.x + c * SHIP.r - s * g, y: ship.y + s * SHIP.r + c * g, vx: ship.vx + SHIP.shot * c, vy: ship.vy + SHIP.shot * s, life: SHIP.shotLife });
      }
      if (hitStar(ship.x, ship.y, SHIP.r * 0.5)) loseShip(field.binary ? 'Burnt up in a star' : 'Burnt up in the Sun');
      else if (Math.hypot(ship.x, ship.y) > ESCAPE_R) loseShip('Escaped the Solar System');
    } else if ((respawn -= dt) <= 0 && lives > 0) newShip();

    for (const s of shots) { stepBody(s, dt); s.life -= dt; }
    shots = shots.filter((s) => s.life > 0 && !hitStar(s.x, s.y, 0));
    for (const k of rocks) { stepBody(k, dt); k.rot += k.spin * dt; }
    rocks = rocks.filter((k) => {
      const r = Math.hypot(k.x, k.y);
      if (hitStar(k.x, k.y, SIZES[k.size].r * 0.5)) { burst(k.x, k.y, 0, 0, 10, '#ffcf66'); return false; }
      // off-screen, unbound and heading out: it is never coming back, so remove it now
      if (!inView(k.x, k.y, SIZES[k.size].r) && energy(k) > 0 && k.x * k.vx + k.y * k.vy > 0) { flash('An asteroid escaped the Sun’s gravity'); return false; }
      if (r >= ESCAPE_R) { flash('An asteroid drifted out of range'); return false; }
      return true;
    });
    // every half second, estimate when each off-screen asteroid will be back in view
    if ((lookahead -= dt) <= 0) {
      lookahead = 0.5;
      for (const k of rocks) k.back = inView(k.x, k.y, SIZES[k.size].r) ? 0 : returnTime(k);
    }
    for (const p of sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    sparks = sparks.filter((p) => p.life > 0);
    if (ramaTimer >= 0 && (ramaTimer -= dt) < 0 && !rama) launchRama();   // one still passing from the last wave counts
    if (rama) {
      stepBody(rama, dt); rama.spin += dt;
      // gone for good once it is outbound beyond range (a hyperbola never returns)
      if (Math.hypot(rama.x, rama.y) > ESCAPE_R && rama.x * rama.vx + rama.y * rama.vy > 0) { if (!rama.hit) flash('Rama has left the Solar System'); rama = null; }
    }
    if (pod) {
      stepBody(pod, dt); pod.age += dt;
      if (ship.alive && Math.hypot(ship.x - pod.x, ship.y - pod.y) < SHIP.r + POD.r) collectPod();
    }

    // shots against rocks
    const born = [];
    for (const s of shots) {
      for (const k of rocks) {
        if (k.dead || s.life <= 0) continue;
        if (Math.hypot(s.x - k.x, s.y - k.y) < SIZES[k.size].r) { k.dead = true; s.life = 0; born.push(...split(k, s)); }
      }
    }
    rocks = rocks.filter((k) => !k.dead).concat(born);
    // shots against Rama: the first hit releases the pod; later ones glance off
    if (rama) for (const s of shots) {
      if (s.life <= 0 || !touchesRama(s.x, s.y, 1)) continue;
      s.life = 0;
      if (!rama.hit) releasePod(s); else burst(s.x, s.y, rama.vx, rama.vy, 3, '#c9d3dd');
    }
    shots = shots.filter((s) => s.life > 0);
    // rocks against the ship
    if (ship.alive && invuln <= 0) {
      for (const k of rocks) if (Math.hypot(ship.x - k.x, ship.y - k.y) < SIZES[k.size].r + SHIP.r * 0.7) { loseShip('Hit by an asteroid'); break; }
      if (ship.alive && rama && touchesRama(ship.x, ship.y, SHIP.r * 0.7)) loseShip('Flew into Rama');
    }
    field.t += dt;
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
    if (score > best && !testWave) { best = score;   // test games (?wave) do not count
      try { localStorage.setItem('kepleroids-best', String(best)); } catch (e) { /* ignore */ } }
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
  function orbitLine(b, colour) {
    const c = { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
    const r0 = Math.hypot(c.x, c.y), v2 = c.vx * c.vx + c.vy * c.vy, en = v2 / 2 - GM / r0;
    const period = en < 0 ? 2 * Math.PI * Math.sqrt((-GM / (2 * en)) ** 3 / GM) : 8;
    const T = Math.min(period * 1.01, 12), n = 360, dt = T / n;
    ctx.strokeStyle = colour; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(c.x), Y(c.y));
    let t = field.t;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < 4; j++) { stepBody(c, dt / 4, t); t += dt / 4; }
      ctx.lineTo(X(c.x), Y(c.y));
      if (hitStar(c.x, c.y, 0, t) || Math.hypot(c.x, c.y) > ESCAPE_R) break;
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function drawRama() {
    // a cylinder seen side on, its axis along its motion; two bands drift round it as it spins
    const v = Math.hypot(rama.vx, rama.vy) || 1, ux = rama.vx / v, uy = rama.vy / v;
    const k = Math.max(1, 0.6 / view.s), hl = RAMA.L / 2 * k, hd = RAMA.D / 2 * k;
    const pt = (a, c) => [X(rama.x) + (a * ux - c * uy) * view.s, Y(rama.y) + (a * uy + c * ux) * view.s];
    ctx.strokeStyle = rama.hit ? '#8e99a4' : '#c9d3dd'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(...pt(-hl, -hd)); ctx.lineTo(...pt(hl, -hd));
    for (let j = 1; j <= 12; j++) ctx.lineTo(...pt(hl + 0.35 * hd * Math.sin(j * Math.PI / 12), -hd * Math.cos(j * Math.PI / 12)));
    ctx.lineTo(...pt(-hl, hd));
    for (let j = 1; j <= 12; j++) ctx.lineTo(...pt(-hl - 0.35 * hd * Math.sin(j * Math.PI / 12), hd * Math.cos(j * Math.PI / 12)));
    ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath();
    for (const off of [0, Math.PI]) {
      const c = hd * Math.cos((reduced ? 0.6 : rama.spin * 1.5) + off);
      ctx.moveTo(...pt(-hl, c)); ctx.lineTo(...pt(hl, c));
    }
    ctx.stroke();
  }
  function draw() {
    const { w, h, s } = view;
    ctx.fillStyle = '#050a14'; ctx.fillRect(0, 0, w, h);
    for (const st of stars) { ctx.fillStyle = `rgba(255,255,255,${0.25 * st.b})`; ctx.fillRect(view.cx + st.x * w * 0.5, view.cy + st.y * h * 0.5, 1.2, 1.2); }
    // the Sun, or the binary: a yellow primary and a smaller, cooler orange secondary
    starsAt(field.t).forEach((st, i) => {
      const g = ctx.createRadialGradient(X(st.x), Y(st.y), 0, X(st.x), Y(st.y), st.r * 3 * s);
      if (i === 0) { g.addColorStop(0, '#fff4c2'); g.addColorStop(0.35, '#ffcf66'); g.addColorStop(1, 'rgba(255,170,60,0)'); }
      else { g.addColorStop(0, '#ffe0c0'); g.addColorStop(0.35, '#ff9a4d'); g.addColorStop(1, 'rgba(255,110,40,0)'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), st.r * 3 * s, 0, 2 * Math.PI); ctx.fill();
    });
    if (!ship) return;
    // the ship's path, and the pod's: integrate a copy ballistically for up to one orbit or 8 s
    if (showOrbit && ship.alive && state === 'play') orbitLine(ship, 'rgba(36,185,190,0.55)');
    if (showOrbit && pod) orbitLine(pod, 'rgba(255,211,107,0.5)');
    ctx.strokeStyle = '#d8c3a5'; ctx.lineWidth = 1.6;
    for (const k of rocks) {
      ctx.beginPath();
      k.shape.forEach((p, i) => { const a = p.a + k.rot, x = X(k.x + p.r * Math.cos(a)), y = Y(k.y + p.r * Math.sin(a)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    }
    // off-screen asteroids: an arrow at the edge pointing to each, with the time until it is back
    const hx = view.cx / s - 14 / s, hy = view.cy / s - 14 / s;
    ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const arrow = (x, y, z, colour, label) => {
      const f = Math.min(hx / Math.abs(x || 1e-9), hy / Math.abs(y || 1e-9));
      const ex = X(x * f), ey = Y(y * f), ang = Math.atan2(y, x);
      ctx.fillStyle = colour; ctx.beginPath();
      ctx.moveTo(ex + z * Math.cos(ang), ey + z * Math.sin(ang));
      ctx.lineTo(ex + z * Math.cos(ang + 2.5), ey + z * Math.sin(ang + 2.5));
      ctx.lineTo(ex + z * Math.cos(ang - 2.5), ey + z * Math.sin(ang - 2.5));
      ctx.closePath(); ctx.fill();
      if (label) { ctx.textAlign = ex > view.cx ? 'right' : 'left'; ctx.fillText(label, ex - 18 * Math.cos(ang), ey - 18 * Math.sin(ang)); }
    };
    for (const k of rocks) {
      if (inView(k.x, k.y, SIZES[k.size].r)) continue;
      arrow(k.x, k.y, 9 - 1.5 * k.size, 'rgba(216,195,165,0.85)', k.back > 0 && Number.isFinite(k.back) ? `back in ${Math.max(1, Math.round(k.back))} s` : '');
    }
    if (pod && !inView(pod.x, pod.y, POD.r)) arrow(pod.x, pod.y, 9, 'rgba(255,211,107,0.9)', 'pod');
    if (rama) drawRama();
    if (pod) {
      // a pulsing golden diamond
      const z = POD.r * (reduced ? 1 : 1 + 0.15 * Math.sin(pod.age * 6)) * Math.max(1, 0.6 / s);
      ctx.fillStyle = '#ffd36b'; ctx.beginPath();
      ctx.moveTo(X(pod.x), Y(pod.y) - z); ctx.lineTo(X(pod.x) + z, Y(pod.y)); ctx.lineTo(X(pod.x), Y(pod.y) + z); ctx.lineTo(X(pod.x) - z, Y(pod.y)); ctx.closePath(); ctx.fill();
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
    hud.textContent = `Score ${score.toLocaleString('en')} · ships ${Math.max(lives, 0)} · wave ${wave}${ship && ship.alive && ship.twin ? ' · twin guns' : ''}${orbit}`;
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
    else if ((ev.key === 'n' || ev.key === 'N') && testWave && state === 'play') startWave();
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
    ? `<h2>Kepleroids</h2><p class="bl-sub">Asteroids, if Kepler had designed it</p><p>Everything here orbits the Sun, including you. Thrust to change your orbit; the dotted line shows where you are heading.</p>
    <p class="bl-keys">← →: turn · ↑: thrust · Space: fire · P: pause</p>
    <p><button type="button" class="bl-start">Start (Enter)</button></p>`
    : null;
  if (intro) showOverlay(intro + (best ? `<p class="bl-best">Best on this device: ${best.toLocaleString('en')}</p>` : ''));
  else showOverlay(`<h2>Kepleroids</h2><p class="bl-sub">Asteroids, if Kepler had designed it</p>
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
  // _debug: access to the game's state, for automated tests only
  return { destroy, setExpanded, _debug: () => ({ rocks, ship, view, rama, pod, shots, wave, field, stars: () => starsAt(field.t), setWave: (n) => { wave = n - 1; startWave(); } }) };
}
