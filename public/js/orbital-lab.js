/*
 * Orbital Laboratory v0.1
 * Educational 2-D Newtonian gravitational integrator (velocity Verlet).
 * Units: AU, solar masses, Julian years. G = 4*pi^2 in these units.
 * Bodies: Sun, Earth, Jupiter, and a massless test particle.
 * This is not an ephemeris and must not be used to predict real objects.
 * The integration is deterministic for each preset and never contacts a server.
 */
(() => {
  const canvas = document.getElementById('orbit-canvas');
  const stage = canvas?.parentElement;
  const playButton = document.getElementById('orbit-play');
  const resetButton = document.getElementById('orbit-reset');
  const select = document.getElementById('orbit-scenario');
  const timeOutput = document.getElementById('orbit-time');
  const loading = document.getElementById('orbit-loading');
  if (!(canvas instanceof HTMLCanvasElement) || !stage || !playButton || !resetButton || !select || !timeOutput) return;

  const ctx = canvas.getContext('2d', {alpha: true});
  if (!ctx) { if (loading) loading.textContent = 'Canvas is unavailable in this browser.'; return; }
  const G = 4 * Math.PI * Math.PI;
  const STEP = 0.002;               // ~0.73 days; preset experiment, not ephemeris
  const SOFTENING_SQ = 0.000001;     // regularizes very close encounters
  const PAST_YEARS = 1.5;
  const MAX_TRACE_POINTS = 850;
  const colors = ['#ffce83', '#8db6ca', '#698a9f', '#4fced2'];
  let state = [];
  let traces = [];
  let timeYears = 0;
  let isPlaying = false;
  let lastFrame = 0;
  let animationId = 0;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let pixelRatio = 1;

  function initialBodies(preset) {
    // These illustrative initial conditions are intentionally not real ephemerides.
    const test = {
      near: {x:1.42, y:-0.36, vx:1.0, vy:4.68},
      resonant: {x:1.12, y:0.18, vx:-0.74, vy:5.84},
      eccentric: {x:1.92, y:0.0, vx:0.0, vy:3.77}
    }[preset] || {x:1.42, y:-0.36, vx:1.0, vy:4.68};
    return [
      {name:'Sun', mass:1.0, x:0, y:0, vx:0, vy:0},
      {name:'Earth', mass:3.003e-6, x:1, y:0, vx:0, vy:2*Math.PI},
      {name:'Jupiter', mass:9.545e-4, x:5.2, y:0, vx:0, vy:2*Math.PI/Math.sqrt(5.2)},
      {name:'Particle', mass:0, ...test}
    ];
  }

  function accelerations(bodies) {
    return bodies.map((body, i) => {
      let ax=0, ay=0;
      for (let j=0; j<bodies.length; j++) {
        if (i===j || bodies[j].mass===0) continue;
        const dx=bodies[j].x-body.x, dy=bodies[j].y-body.y;
        const squared=dx*dx+dy*dy+SOFTENING_SQ;
        const strength=G*bodies[j].mass/(squared*Math.sqrt(squared));
        ax += dx*strength; ay += dy*strength;
      }
      return {ax,ay};
    });
  }
  function step(bodies, dt) {
    const a0=accelerations(bodies);
    for(let i=0;i<bodies.length;i++) {
      bodies[i].x += bodies[i].vx*dt + .5*a0[i].ax*dt*dt;
      bodies[i].y += bodies[i].vy*dt + .5*a0[i].ay*dt*dt;
    }
    const a1=accelerations(bodies);
    for(let i=0;i<bodies.length;i++) {
      bodies[i].vx += .5*(a0[i].ax+a1[i].ax)*dt;
      bodies[i].vy += .5*(a0[i].ay+a1[i].ay)*dt;
    }
  }
  function snapshot(bodies) {
    // Positions in heliocentric, non-rotating coordinates.
    const sun=bodies[0];
    return bodies.map(b=>({x:b.x-sun.x,y:b.y-sun.y}));
  }
  function reset() {
    stop();
    state=initialBodies(select.value);
    timeYears=0;
    traces=state.map(()=>[]);
    const past=state.map(b=>({...b}));
    const steps=Math.round(PAST_YEARS / STEP);
    const old=[];
    for(let n=0;n<steps;n++) {
      step(past,-STEP);
      if (n%3===0) old.push(snapshot(past));
    }
    old.reverse().forEach(row=>row.forEach((pt,i)=>traces[i].push(pt)));
    remember();
    updateControls();
    draw();
  }
  function remember() {
    const row=snapshot(state);
    row.forEach((pt,i)=>{
      traces[i].push(pt);
      if (traces[i].length>MAX_TRACE_POINTS) traces[i].shift();
    });
  }
  function updateControls() {
    playButton.setAttribute('aria-pressed',String(isPlaying));
    playButton.innerHTML=isPlaying ? 'Ⅱ <span>Pause</span>' : '▶ <span>Play</span>';
    timeOutput.value=`${timeYears.toFixed(2)} yr`;
    timeOutput.textContent=timeOutput.value;
  }
  function start() {
    if (isPlaying) return;
    isPlaying=true;
    lastFrame=0;
    updateControls();
    animationId=requestAnimationFrame(frame);
  }
  function stop() {
    isPlaying=false;
    cancelAnimationFrame(animationId);
    lastFrame=0;
    updateControls();
  }
  function frame(timestamp) {
    if (!isPlaying) return;
    if (lastFrame) {
      const dtReal=Math.min((timestamp-lastFrame)/1000, .06);
      const advance=Math.max(1,Math.round(dtReal*.23/STEP));
      for(let n=0;n<advance;n++) {
        step(state,STEP);
        timeYears+=STEP;
        if(n%2===0) remember();
      }
      updateControls();
      draw();
    }
    lastFrame=timestamp;
    animationId=requestAnimationFrame(frame);
  }
  function resize() {
    const bounds=stage.getBoundingClientRect();
    viewportWidth=Math.max(240,Math.round(bounds.width));
    viewportHeight=Math.max(240,Math.round(bounds.height));
    pixelRatio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(viewportWidth*pixelRatio);
    canvas.height=Math.round(viewportHeight*pixelRatio);
    canvas.style.width=viewportWidth+'px';
    canvas.style.height=viewportHeight+'px';
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    draw();
  }
  function draw() {
    const w=viewportWidth, h=viewportHeight;
    if(!w||!h||!state.length) return;
    ctx.clearRect(0,0,w,h);
    const scale=Math.min(w/5.6,h/3.65);
    const cx=w*.52, cy=h*.52;
    const xy=(point)=>({x:cx+point.x*scale,y:cy-point.y*scale});

    // Instrument-like crosshair; no decorative star fields or fictitious telemetry.
    ctx.strokeStyle='rgba(159,190,207,.12)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(18,cy);ctx.lineTo(w-18,cy);ctx.moveTo(cx,15);ctx.lineTo(cx,h-15);ctx.stroke();
    ctx.strokeStyle='rgba(159,190,207,.09)';ctx.setLineDash([3,8]);
    for(const radius of [1,2]) {ctx.beginPath();ctx.arc(cx,cy,radius*scale,0,Math.PI*2);ctx.stroke();}
    ctx.setLineDash([]);

    // Only Earth and the test particle are drawn as trajectory trails; Jupiter's
    // perturbation is included in the gravitational calculation offscreen.
    for(const i of [1,3]) {
      const points=traces[i];
      if(points.length<2) continue;
      ctx.beginPath();
      points.forEach((pt,index)=>{
        const p=xy(pt);
        if(index===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
      });
      ctx.strokeStyle=i===3?'rgba(79,206,210,.88)':'rgba(141,182,202,.5)';
      ctx.lineWidth=i===3?1.8:1.15;
      ctx.stroke();
    }
    const positions=snapshot(state);
    for(const i of [0,1,3]) {
      const p=xy(positions[i]);
      if(p.x<-20||p.x>w+20||p.y<-20||p.y>h+20)continue;
      if(i===0) {
        const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,16);
        glow.addColorStop(0,'rgba(255,206,131,.25)');glow.addColorStop(1,'rgba(255,206,131,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=colors[i];
      ctx.beginPath();ctx.arc(p.x,p.y,i===0?6:i===3?4.7:3.8,0,Math.PI*2);ctx.fill();
      if(i===3) {ctx.strokeStyle='rgba(79,206,210,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,8.5,0,Math.PI*2);ctx.stroke();}
    }
    ctx.fillStyle='rgba(179,200,213,.56)';ctx.font='11px system-ui, sans-serif';
    ctx.fillText('HELIOCENTRIC · XY PLANE',17,h-17);
    ctx.textAlign='right';ctx.fillText('AU',w-16,h-17);ctx.textAlign='left';
  }

  playButton.addEventListener('click',()=>isPlaying?stop():start());
  resetButton.addEventListener('click',reset);
  select.addEventListener('change',reset);
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&isPlaying)stop();});
  // Portable plain-JavaScript module, kept separate from Astro for reuse/tests.
  window.__orbitalLab = {getState:()=>({timeYears,isPlaying,bodies:state.map(b=>({...b}))}), reset};
  reset();resize();
  if(loading)loading.hidden=true;
})();
