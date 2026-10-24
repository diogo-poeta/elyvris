/*
 * Electromagnetic pulse through a dielectric film.
 *
 * Exact normal-incidence, multiple-reflection solution of Maxwell's equations
 * for an ideal, non-magnetic, nondispersive and lossless air / film / air stack.
 * z and ct are measured in free-space carrier wavelengths. E is in units of
 * incident electric-field amplitude; h = Z0 H. The 100 nm film and 380 nm
 * carrier connect this teaching illustration to the thin-film geometry and
 * UV-A range of Diogo Poeta's thesis. n = 2.6 is an illustrative constant,
 * NOT a fitted TiO2 dispersion or a prediction of a measured sample.
 *
 * The displayed surface is E(z,t); the short flow marks follow the sign of
 * instantaneous S_z = E H. Projection, colour and transverse windowing are
 * visual encodings. They do not add a transverse optical variation.
 * Model and provenance: work/hero-research.md; Peatross & Ware,
 * Physics of Light and Optics, Chapters 2 and 4, https://optics.byu.edu/.
 */
(function (root) {
  'use strict';

  const N = 2.6;
  const D = 100 / 380;
  const R01 = (1 - N) / (1 + N);
  const R10 = -R01;
  const T01 = 2 / (1 + N);
  const T10 = 2 * N / (1 + N);
  const ROUND_TRIP = R10 * R10;
  const PULSE_PERIOD = 5.2;
  const WIDTH = 0.66;
  const TERMS = 12;

  function pulse(coordinate) {
    return Math.exp(-0.5 * coordinate * coordinate / (WIDTH * WIDTH)) * Math.cos(2 * Math.PI * coordinate);
  }

  function onePulse(z, time) {
    let forward = 0;
    let backward = 0;
    let index;
    if (z < 0) {
      index = 1;
      forward = pulse(z - time);
      backward = R01 * pulse(-z - time);
      for (let m = 0, weight = 1; m < TERMS; m++, weight *= ROUND_TRIP) {
        backward += T01 * T10 * R10 * weight * pulse(-z + 2 * (m + 1) * N * D - time);
      }
    } else if (z <= D) {
      index = N;
      for (let m = 0, weight = 1; m < TERMS; m++, weight *= ROUND_TRIP) {
        forward += T01 * weight * pulse(N * z + 2 * m * N * D - time);
        backward += T01 * R10 * weight * pulse(N * (2 * D - z) + 2 * m * N * D - time);
      }
    } else {
      index = 1;
      for (let m = 0, weight = 1; m < TERMS; m++, weight *= ROUND_TRIP) {
        forward += T01 * T10 * weight * pulse(z - D + (2 * m + 1) * N * D - time);
      }
    }
    const e = forward + backward;
    const h = index * (forward - backward);
    return { e, h, index, flux: e * h, energy: (index * index * e * e + h * h) / 2 };
  }

  // Three adjacent pulses form a long, spatially periodic train in this view.
  // Keeping every optical path makes both E and H continuous at each interface.
  function fieldAt(z, time, repeat = true) {
    if (!repeat) return onePulse(z, time);
    let e = 0;
    let h = 0;
    let index = z >= 0 && z <= D ? N : 1;
    for (let p = -1; p <= 1; p++) {
      const value = onePulse(z, time + p * PULSE_PERIOD);
      e += value.e;
      h += value.h;
    }
    return { e, h, index, flux: e * h, energy: (index * index * e * e + h * h) / 2 };
  }

  const model = Object.freeze({ fieldAt, index: N, thicknessNm: 100, wavelengthNm: 380, thickness: D });
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (!root.document) return;
  root.HeroThinFilmField = model;

  const canvas = document.querySelector('#wave-field');
  const toggle = document.querySelector('#wave-toggle');
  if (!canvas || !toggle) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const zMin = -1.3, zMax = 1.6;
  const count = 235;
  const samples = new Array(count);
  let running = !reduced.matches;
  let visible = true;
  let frameId = 0;
  let lastFrame = 0;
  let lastClock = 0;
  let time = 0.16;
  let width = 520, height = 590;
  let background;

  function project(z, transverse, electric = 0) {
    // An orthographic view of a field surface and the two interfaces.
    const position = z - D / 2;
    return {
      x: width * (0.51 + position * 0.252 + transverse * 0.204),
      y: height * (0.54 - position * 0.143 + transverse * 0.104 - electric * 0.094)
    };
  }

  function path(points, stroke, lineWidth, fill) {
    context.beginPath();
    points.forEach((point, i) => { if (i) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
    if (fill) { context.closePath(); context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
  }

  function plane(z, fill, stroke) {
    const points = [project(z,-1.07,1.36),project(z,1.07,1.36),project(z,1.07,-1.36),project(z,-1.07,-1.36)];
    path(points, stroke, 0.8, fill);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    background = context.createRadialGradient(width*.47,height*.48,10,width*.52,height*.53,width*.75);
    background.addColorStop(0, '#234f40');
    background.addColorStop(.58, '#193c31');
    background.addColorStop(1, '#15332b');
    draw();
  }

  function draw() {
    context.fillStyle = background || '#19372f';
    context.fillRect(0,0,width,height);
    for (let i=0; i<count; i++) {
      const z = zMin + (zMax-zMin)*i/(count-1);
      const result = fieldAt(z,time);
      samples[i] = {z, ...result};
    }

    // A quiet computational mesh lies beneath the field surface.
    for(let u=-1.2;u<=1.21;u+=.24) path([project(zMin,u),project(zMax,u)],'rgba(214,238,190,.075)',.65);
    for(let z=zMin;z<=zMax;z+=.145) path([project(z,-1.2),project(z,1.2)],'rgba(214,238,190,.065)',.65);

    // The ideal film is a physical region, with a clearly separated pair of
    // interfaces. Its width is determined by the same z coordinate as E(z,t).
    const top = [project(0,-1.07,1.36),project(D,-1.07,1.36),project(D,1.07,1.36),project(0,1.07,1.36)];
    const side = [project(0,1.07,1.36),project(D,1.07,1.36),project(D,1.07,-1.36),project(0,1.07,-1.36)];
    plane(0,'rgba(153,190,139,.045)','rgba(216,241,184,.24)');
    path(top,'rgba(216,241,184,.25)',.7,'rgba(178,211,150,.075)');
    path(side,'rgba(216,241,184,.2)',.7,'rgba(178,211,150,.035)');

    // E(z,t) as an illuminated, coherent surface. Every transverse row uses
    // the identical physical solution: the taper is a presentation mask only.
    const rows = 15;
    for(let row=0;row<rows;row++) {
      const u = -1 + 2*row/(rows-1);
      const taper = Math.pow(Math.max(0,1-u*u),.42);
      const points = samples.map(sample=>project(sample.z,u,sample.e));
      context.save();
      context.globalAlpha = .15 + .65*taper;
      context.shadowColor = '#d8f58a';
      context.shadowBlur = row===7 ? 8 : 0;
      path(points,row===7?'#e1f7b1':'#b8d59e',row===7?1.6:.72);
      context.restore();
    }
    // Ribs expose the shorter carrier wavelength inside the higher-index
    // region rather than adding an unrelated second travelling wave.
    for(let i=0;i<count;i+=7) {
      const sample=samples[i];
      const a=project(sample.z,-1,sample.e), b=project(sample.z,1,sample.e);
      const signal=Math.min(1,Math.abs(sample.e));
      path([a,b],`rgba(216,245,174,${.08+.21*signal})`,.65);
    }

    // Short directional marks are sampled from instantaneous E*H, not from
    // an arbitrary particle trajectory. They reverse with reflected energy.
    for(let lane=0;lane<3;lane++) {
      const u=(lane-1)*.58;
      for(let i=7+lane*9;i<count-8;i+=23) {
        const sample=samples[i];
        const strength=Math.min(1,Math.abs(sample.flux));
        if(strength<.06)continue;
        const direction=Math.sign(sample.flux);
        const start=project(sample.z,u,sample.e);
        const end=project(sample.z+direction*.036,u,sample.e);
        const tangent=Math.atan2(end.y-start.y,end.x-start.x);
        const size=2.4+2.1*strength;
        const left={x:end.x-size*Math.cos(tangent-.55),y:end.y-size*Math.sin(tangent-.55)};
        const right={x:end.x-size*Math.cos(tangent+.55),y:end.y-size*Math.sin(tangent+.55)};
        path([start,end],`rgba(230,252,189,${.25+.65*strength})`,1.05);
        path([left,end,right],`rgba(230,252,189,${.25+.65*strength})`,1.05);
      }
    }

    // Front boundary is drawn last so the optical surface reads as passing
    // through a film, not as a free-floating decorative wave.
    plane(D,'rgba(126,171,126,.025)','rgba(224,244,192,.43)');
    const vignette=context.createLinearGradient(0,0,0,height);
    vignette.addColorStop(0,'rgba(21,51,43,.38)');
    vignette.addColorStop(.25,'rgba(21,51,43,0)');
    vignette.addColorStop(.82,'rgba(21,51,43,0)');
    vignette.addColorStop(1,'rgba(21,51,43,.35)');
    context.fillStyle=vignette;context.fillRect(0,0,width,height);
  }

  function updateToggle() {
    toggle.setAttribute('aria-pressed',String(running));
    toggle.setAttribute('aria-label',running?'Pause the electromagnetic animation':'Play the electromagnetic animation');
    toggle.innerHTML=running?'Pause <span aria-hidden="true">Ⅱ</span>':'Play <span aria-hidden="true">▷</span>';
  }
  function animate(now) {
    frameId=0;
    if(!running||!visible||document.hidden){lastClock=0;return;}
    if(!lastClock)lastClock=now;
    const elapsed=Math.min(.1,(now-lastClock)/1000);
    lastClock=now;
    time+=elapsed*.64;
    if(time> PULSE_PERIOD/2)time-=PULSE_PERIOD;
    if(!lastFrame||now-lastFrame>=1000/30){draw();lastFrame=now;}
    frameId=requestAnimationFrame(animate);
  }
  function syncLoop() {
    if(running&&visible&&!document.hidden){if(!frameId)frameId=requestAnimationFrame(animate);}
    else {cancelAnimationFrame(frameId);frameId=0;lastClock=0;}
  }
  toggle.addEventListener('click',()=>{running=!running;updateToggle();syncLoop();});
  document.addEventListener('visibilitychange',syncLoop);
  reduced.addEventListener?.('change',()=>{if(reduced.matches){running=false;updateToggle();syncLoop();}});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncLoop();},{rootMargin:'80px'}).observe(canvas);
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize',resize);
  updateToggle();resize();syncLoop();
})(typeof globalThis !== 'undefined' ? globalThis : window);
