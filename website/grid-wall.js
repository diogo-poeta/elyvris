(function () {
  'use strict';

  // ---------- Scene constants (world units: think of them as metres) ----------
  const R = 40;            // radius of the cylinder the wall is cut from
  const D = 30;            // distance from the camera to the middle of the wall
  const THETA = 0.74;      // the wall spans column angles -THETA..+THETA (radians)
  const Y_TOP = 9;         // top edge of the wall (the bottom runs off-screen)
  const Y_BOT = -17;
  const COLS = 300;        // vertical columns (the striations)
  const DY = 0.23;
  const N_FREE = 2600;
  const N_SPARK = 150;     // faint sparks floating in the void
  const VOX = 0.12;        // voxel edge length
  const NEAR = 0.6;        // anything closer than this to the camera is not drawn
  const RIFT = 0.17;       // how far (radians) the two halves part when access is granted
  const BG = '#02040a';
  const MODES = ['idle', 'scan', 'denied', 'granted', 'inside'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const gauss = () => { // normal random number (Box-Muller)
    const u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v);
  };
  // Seeded random numbers, so the wall has the same shape on every visit.
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STOPS = [
    [0.00, 48, 92, 255], [0.15, 104, 60, 255], [0.32, 196, 40, 240],
    [0.50, 255, 38, 140], [0.68, 230, 22, 60], [0.86, 160, 10, 26], [1.00, 100, 4, 14]
  ];
  const LUT = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const u = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && u > STOPS[k + 1][0]) k++;
    const a = STOPS[k], b = STOPS[k + 1], t = (u - a[0]) / (b[0] - a[0]);
    for (let j = 0; j < 3; j++) LUT[i * 3 + j] = a[j + 1] + (b[j + 1] - a[j + 1]) * t;
  }
  const lutIndex = th => (clamp(Math.abs(th) / THETA, 0, 1) * 255) | 0;

  // Opaque black as one 32-bit pixel (the byte order depends on the processor).
  const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const OPAQUE_BLACK = LITTLE ? 0xff000000 : 0x000000ff;

  function makeCanvas() { return document.createElement('canvas'); }

  function create(canvas, opts) {
    if (!canvas || !canvas.getContext) throw new Error('GridWall.create needs a <canvas> element');
    const still = !!(opts && opts.still);
    const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    const rnd = seeded(20391116);

    // ---------- The columns (one value per vertical striation) ----------
    const cU = new Float32Array(COLS), cTh = new Float32Array(COLS), cGain = new Float32Array(COLS);
    const cF1 = new Float32Array(COLS), cPat = new Float32Array(COLS), cPh = new Float32Array(COLS);
    const cFlow = new Float32Array(COLS), cTop = new Float32Array(COLS), cSpan = new Float32Array(COLS);
    const cReveal = new Float32Array(COLS);
    const cR = new Float32Array(COLS), cG = new Float32Array(COLS), cB = new Float32Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const u = ((c + 0.5) / COLS) * 2 - 1;
      cU[c] = u;
      cTh[c] = u * THETA + (rnd() - 0.5) * (THETA / COLS) * 0.9;
      let gain = 0.5 + 0.6 * rnd();
      if (rnd() < 0.08) gain *= 1.9;          // a few hot columns
      else if (rnd() < 0.12) gain *= 0.35;    // and some dim ones
      // Broad bright and dark bands of columns (two slow waves across the wall).
      gain *= 0.35 + 0.9 * (0.5 + 0.5 * Math.sin(u * 31 + 1.3)) * (0.55 + 0.45 * Math.sin(u * 9.7 + 0.4));
      gain *= smooth(1.0, 0.82, Math.abs(u)); // the side edges fray into the dark
      cGain[c] = gain;
      cF1[c] = 0.3 + 0.9 * rnd();             // spatial frequency of the light streaks
      cPat[c] = (rnd() < 0.5 ? -1 : 1) * (0.8 + 2.6 * rnd()); // streak speed along the column
      cPh[c] = rnd() * 6.2832;
      cFlow[c] = (rnd() - 0.5) * 0.7;         // the voxels themselves drift slowly up or down
      // Ragged top edge: a slow wave plus random steps.
      cTop[c] = Y_TOP + 1.1 * Math.sin(u * 6.3 + 0.7) + 0.6 * Math.sin(u * 17.0) + (rnd() - 0.5) * 2.2;
      cSpan[c] = cTop[c] - Y_BOT;
      cReveal[c] = 0.55 * Math.abs(u) + 0.45 * rnd(); // the wall assembles from the middle outward
      const li = clamp(lutIndex(cTh[c]) + (((rnd() - 0.5) * 18) | 0), 0, 255) * 3;
      cR[c] = LUT[li]; cG[c] = LUT[li + 1]; cB[c] = LUT[li + 2];
    }
    // Per-frame column values (filled in each frame, reused).
    const colS = new Float32Array(COLS), colC = new Float32Array(COLS), colArc = new Float32Array(COLS);
    const colVis = new Float32Array(COLS), colBul = new Float32Array(COLS), colLight = new Float32Array(COLS);
    const colSwell = new Float32Array(COLS), colLip = new Float32Array(COLS), colClimb = new Float32Array(COLS);

    const ROWS = Math.ceil((Y_TOP + 2.5 - Y_BOT) / DY);
    const cellB = new Float32Array(COLS * ROWS);   // fixed random brightness of each voxel
    const cellDep = new Float32Array(COLS * ROWS); // small depth offset (the wall has some thickness)
    const cellR = new Float32Array(COLS * ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      cellB[i] = 0.5 + 0.7 * rnd() * rnd() + (rnd() < 0.015 ? 1.6 : 0);
      cellDep[i] = rnd() * 0.5;
      cellR[i] = rnd();
    }
    // Per-row values, refilled each frame.
    const rowY = new Float32Array(ROWS), rowSin = new Float32Array(ROWS), rowCos = new Float32Array(ROWS);
    const rowSwell = new Float32Array(ROWS), rowBul = new Float32Array(ROWS), rowBand = new Float32Array(ROWS);
    const rowFade = new Float32Array(ROWS);
    for (let j = 0; j < ROWS; j++) {
      const y = Y_BOT + j * DY;
      rowY[j] = y;
      rowSin[j] = Math.sin(0.14 * y); rowCos[j] = Math.cos(0.14 * y);
      // Bottom of the wall dissolves into the dark; every 9th row is a slightly brighter seam.
      rowFade[j] = smooth(Y_BOT, Y_BOT + 6, y) * (j % 9 === 0 ? 1.45 : 1);
    }

    // ---------- Loose particles (a ring buffer: the oldest one is reused) ----------
    const pX = new Float32Array(N_FREE), pY = new Float32Array(N_FREE), pZ = new Float32Array(N_FREE);
    const pVx = new Float32Array(N_FREE), pVy = new Float32Array(N_FREE), pVz = new Float32Array(N_FREE);
    const pLife = new Float32Array(N_FREE), pMax = new Float32Array(N_FREE), pK = new Uint8Array(N_FREE);
    const pR = new Float32Array(N_FREE), pG = new Float32Array(N_FREE), pB = new Float32Array(N_FREE);
    let pHead = 0;

    // ---------- Sparks in the void ----------
    const sX = new Float32Array(N_SPARK), sY = new Float32Array(N_SPARK), sZ = new Float32Array(N_SPARK);
    const sV = new Float32Array(N_SPARK), sPh = new Float32Array(N_SPARK), sAge = new Float32Array(N_SPARK);
    const sR = new Float32Array(N_SPARK), sG = new Float32Array(N_SPARK), sB = new Float32Array(N_SPARK);

    // ---------- Off-screen canvases ----------
    const buf = makeCanvas(), bctx = buf.getContext('2d');           // the voxel pixel buffer
    const h1 = makeCanvas(), h2 = makeCanvas(), h3 = makeCanvas();   // smaller copies for the glow
    const h1c = h1.getContext('2d'), h2c = h2.getContext('2d'), h3c = h3.getContext('2d');
    const gR = makeCanvas(), gC = makeCanvas();                      // red / cyan parts for the RGB split
    const gRc = gR.getContext('2d'), gCc = gC.getContext('2d');
    const haze = makeCanvas(), overlay = makeCanvas();
    let img = null, pix = null, pix32 = null;
    let W = 1, H = 1, dpr = 1, bw = 2, bh = 2, bs = 0.5, f = 1, fb = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width || window.innerWidth));
      H = Math.max(1, Math.round(rect.height || window.innerHeight));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      bs = Math.min(0.75, 960 / W, 720 / H);
      bw = Math.max(2, Math.round(W * bs));
      bh = Math.max(2, Math.round(H * bs));
      buf.width = bw; buf.height = bh;
      img = bctx.createImageData(bw, bh);
      pix = img.data;
      pix32 = new Uint32Array(pix.buffer);
      h1.width = Math.max(1, bw >> 1); h1.height = Math.max(1, bh >> 1);
      h2.width = Math.max(1, bw >> 2); h2.height = Math.max(1, bh >> 2);
      h3.width = Math.max(1, bw >> 3); h3.height = Math.max(1, bh >> 3);
      gR.width = gC.width = bw; gR.height = gC.height = bh;
      // Focal length: a wide view on landscape screens, limited by the width on phones.
      f = Math.min(H * 0.95, W * 0.62);
      fb = f * bs;
      buildHaze();
      buildOverlay();
    }

    // A dim violet glow behind the wall (drawn once, scaled up each frame).
    function buildHaze() {
      const w = Math.max(2, W >> 2), h = Math.max(2, H >> 2);
      haze.width = w; haze.height = h;
      const g = haze.getContext('2d');
      const grd = g.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.7);
      grd.addColorStop(0, 'rgba(60,22,110,0.55)');
      grd.addColorStop(0.45, 'rgba(34,8,52,0.35)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }

    // Old-monitor overlay: dark scan lines every 3 px and darker corners (vignette).
    function buildOverlay() {
      overlay.width = W; overlay.height = H;
      const g = overlay.getContext('2d');
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.30)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }

    // ---------- State ----------
    let mode = 'idle', started = false, dead = false;
    let raf = 0, lastNow = 0, pendingDt = 0;
    let clock = 0;
    let t = 0;            // animation time (runs slower in 'inside')
    let modeT = 0;        // seconds since the last setMode
    let introOn = false, introT = 0, introResolve = null, introPromise = null, introTimer = 0, queued = null;
    let deniedAt = -99, lastPulse = -99, tearsAt = -99;
    const tears = new Float32Array(9); // 3 tears x (y, height, shift)
    let shedAcc = 0, edgeAcc = 0, sideAcc = 0, streamAcc = 0;
    // Smoothly changing scene values. 'P' is what is drawn this frame.
    const P = {
      gain: 0, reveal: 0, camZ: -18, camX: 0, camY: 0, spark: 0, bulge: 0, ripple: -1, climb: 0,
      sweep: 0, sweepTh: 0, scan: 0, scanY: 0, red: 0, glitch: 0, rift: 0, bloom: 1, ts: 1, warp: 0,
      breathe: 0.5, swell: 0, shed: 1, crisp: 1
    };

    function spawn(x, y, z, vx, vy, vz, life, r, g, b, kind) {
      const i = pHead;
      pHead = (pHead + 1) % N_FREE;
      pX[i] = x; pY[i] = y; pZ[i] = z; pVx[i] = vx; pVy[i] = vy; pVz[i] = vz;
      pLife[i] = life; pMax[i] = life; pR[i] = r; pG[i] = g; pB[i] = b; pK[i] = kind;
    }
    function respawnSpark(i, nearCam) {
      // Sparks float between the camera and the wall.
      sZ[i] = nearCam ? P.camZ + 2 + Math.random() * 36 : D - 3 - Math.random() * 12;
      sX[i] = (Math.random() - 0.5) * 50;
      sY[i] = -12 + Math.random() * 26;
      sV[i] = 0.8 + Math.random() * 2.6;
      sPh[i] = Math.random() * 6.28;
      sAge[i] = 0;
      const k = Math.random();
      if (k < 0.6) { sR[i] = 255; sG[i] = 120; sB[i] = 200; }
      else if (k < 0.85) { sR[i] = 255; sG[i] = 235; sB[i] = 250; }
      else { sR[i] = 110; sG[i] = 240; sB[i] = 255; }
    }
    function resetParticles() {
      pLife.fill(0);
      for (let i = 0; i < N_SPARK; i++) { respawnSpark(i, true); sAge[i] = 5; }
    }
    resetParticles();

    function introValues(T) {
      P.spark = smooth(0, 1.4, T);
      P.reveal = smooth(1.9, 5.8, T);
      P.gain = smooth(1.8, 5.2, T);
      P.camZ = -18 + 18 * easeOut((T - 2) / 4.6);
      P.climb = T > 2 && T < 8 ? 1.3 * (1 - smooth(5.5, 8, T)) : 0;
      P.bulge = 11 * (smooth(6.0, 8.2, T) - smooth(9.4, 11.6, T)) * (1 + 0.05 * Math.sin(T * 5.5));
      P.ripple = T > 6.2 && T < 10 ? T - 6.2 : -1;
      P.breathe = 0.2 + 0.3 * smooth(10, 12, T);
      P.swell = 1.3 * smooth(10, 12.2, T);
      P.sweep = 0; P.scan = 0; P.red = 0; P.glitch = 0; P.rift = 0; P.warp = 0;
      P.bloom = 1; P.crisp = 1; P.ts = 1; P.shed = 0.3 + 0.7 * smooth(3, 6, T);
    }

    function modeValues(dt) {
      const k = r => 1 - Math.exp(-dt * r); // approach factor for exponential smoothing
      const inside = mode === 'inside';
      P.spark += ((started ? (inside ? 0.2 : 1) : 0) - P.spark) * k(1.5);
      P.reveal += ((started ? 1 : 0) - P.reveal) * k(1.2);
      P.gain += ((started ? (inside ? 0.38 : 1) : 0) - P.gain) * k(inside ? 0.9 : 1.6);
      P.bloom += ((inside ? 0.3 : 1) - P.bloom) * k(1);
      P.crisp += ((inside ? 0.22 : 1) - P.crisp) * k(1);
      P.ts += ((inside ? 0.35 : 1) - P.ts) * k(1);
      P.camZ += (0 - P.camZ) * k(0.8);
      P.bulge *= 1 - k(1.5);
      P.climb *= 1 - k(2);
      P.ripple = -1;
      P.breathe += (0.5 - P.breathe) * k(1);
      P.swell += (1.3 - P.swell) * k(0.6);
      P.shed += ((inside ? 0.25 : 1) - P.shed) * k(1);
      // 'scan': a horizontal band of light travels up and down the wall.
      P.scan += ((mode === 'scan' ? 1 : 0) - P.scan) * k(5);
      if (mode === 'scan') P.scanY = -8 + 15 * (0.5 - 0.5 * Math.cos(modeT * 2.2));
      // 'denied': one red pulse with a glitch (a single smooth rise and fall over 0.7 s).
      const dd = clock - deniedAt;
      const e = dd >= 0 && dd < 0.7 ? Math.sin(Math.PI * dd / 0.7) : 0;
      P.red = e;
      P.glitch = dd >= 0 && dd < 0.62 ? Math.min(1, e * 1.6) : 0;
      if (mode === 'denied' && dd > 0.75) setModeNow('idle');
      // 'granted': the rift opens over 1.2 s and particles stream out of it.
      if (mode === 'granted') {
        const r = clamp(modeT / 1.2, 0, 1);
        P.rift = r * r * (3 - 2 * r);
        P.warp = modeT < 1.6 ? Math.sin(Math.PI * clamp(modeT / 1.6, 0, 1)) : 0;
      } else {
        P.rift *= 1 - k(inside ? 0.6 : 2.5);
        P.warp *= 1 - k(3);
      }
      // A soft light sweep across the wall every 11 seconds (not in 'inside').
      const cyc = (t % 11) / 3.2;
      P.sweep = !inside && cyc < 1 ? Math.sin(Math.PI * cyc) * 0.6 : 0;
      P.sweepTh = -THETA + 2 * THETA * clamp(cyc, 0, 1);
    }

    // ---------- Simulation step: spawn and move loose particles and sparks ----------
    function simulate(dt) {
      const sdt = dt * P.ts;
      const vis = P.gain * P.reveal;
      // Particles shedding from the ragged top edge and drifting up into the void.
      edgeAcc += sdt * 70 * vis * P.shed;
      while (edgeAcc >= 1) {
        edgeAcc -= 1;
        const c = (Math.random() * COLS) | 0;
        if (colVis[c] < 0.3) continue;
        const y = cTop[c] - Math.random() * 1.5, rr = R - 0.3;
        const x = rr * colS[c], z = D - R + rr * colC[c];
        spawn(x, y, z, (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 1.1, -0.2 - Math.random() * 0.9,
          3 + Math.random() * 3.5, cR[c] * 1.1, cG[c] * 1.1, cB[c] * 1.1, 0);
      }
      // Particles peeling off the side edges (visible while the camera is still far back).
      sideAcc += sdt * 25 * vis * P.shed * (0.3 + 0.7 * smooth(-4, -14, P.camZ));
      while (sideAcc >= 1) {
        sideAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const c = side < 0 ? (Math.random() * 6) | 0 : COLS - 1 - ((Math.random() * 6) | 0);
        const y = Y_BOT * 0.6 + Math.random() * (cTop[c] - Y_BOT * 0.6), rr = R - 0.3;
        const th = cTh[c], sp = 0.6 + Math.random() * 1.6;
        spawn(rr * Math.sin(th), y, D - R + rr * Math.cos(th),
          side * Math.cos(th) * sp, (Math.random() - 0.3) * 0.5, -side * Math.sin(th) * sp - 0.3,
          3 + Math.random() * 3, cR[c], cG[c], cB[c], 0);
      }
      // Particles thrown off the crest of the bulge.
      shedAcc += sdt * 650 * (P.bulge / 11);
      while (shedAcc >= 1) {
        shedAcc -= 1;
        const s = gauss() * 6.5, y = -1.5 + gauss() * 5, th = s / R;
        const prof = Math.exp(-(s * s) / 220 - ((y + 1.5) * (y + 1.5)) / 110);
        const d = P.bulge * prof, rr = R - d, sn = Math.sin(th), cs = Math.cos(th);
        const sp = (2 + Math.random() * 5) * (0.4 + prof);
        const li = lutIndex(th) * 3;
        spawn(rr * sn, y, D - R + rr * cs,
          -sn * sp + s * 0.06 + gauss() * 0.6, (y + 1.5) * 0.08 + gauss() * 0.5 + 0.3, -cs * sp,
          1.6 + Math.random() * 2.2,
          LUT[li] * 0.6 + 102, LUT[li + 1] * 0.6 + 70, LUT[li + 2] * 0.6 + 90, 0);
      }
      // The stream that pours out of the rift and past the camera.
      if (mode === 'granted' && modeT > 0.08) {
        const rate = modeT < 1.1 ? 2600 : 140;
        streamAcc += dt * rate;
        while (streamAcc >= 1) {
          streamAcc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const th = side * RIFT * P.rift * (0.55 + 0.6 * Math.random());
          const y = -12 + Math.random() * 20.5, rr = R - Math.random() * 2;
          const cyan = Math.random() < 0.55;
          const li = lutIndex(th * 2.2) * 3;
          spawn(rr * Math.sin(th), y, D - R + rr * Math.cos(th),
            side * (1.5 + 6 * Math.random()), (Math.random() - 0.5) * 2.4 + y * 0.05, -(13 + 20 * Math.random()),
            3.5,
            cyan ? 120 : LUT[li], cyan ? 245 : LUT[li + 1], cyan ? 255 : LUT[li + 2], 1);
        }
      } else streamAcc = 0;
      // Move the loose particles: a gentle swirling drift plus a little buoyancy.
      for (let i = 0; i < N_FREE; i++) {
        if (pLife[i] <= 0) continue;
        // Stream particles fly in real time; the drifting ones follow the (maybe slowed) scene time.
        const pdt = pK[i] === 1 ? dt : sdt;
        pLife[i] -= pdt;
        if (pK[i] === 0) {
          pVx[i] += Math.sin(pY[i] * 0.37 + t * 0.5 + i) * 0.35 * sdt;
          pVz[i] += Math.cos(pX[i] * 0.29 + t * 0.4) * 0.2 * sdt;
          pVy[i] += 0.06 * sdt;
          const damp = 1 - 0.25 * sdt;
          pVx[i] *= damp; pVy[i] *= damp; pVz[i] *= damp;
        }
        pX[i] += pVx[i] * pdt; pY[i] += pVy[i] * pdt; pZ[i] += pVz[i] * pdt;
        if (pZ[i] - P.camZ < NEAR) pLife[i] = 0; // it flew past the camera
      }
      // Sparks drift toward the viewer (faster during the rift, like flying through).
      const warp = 1 + 9 * P.warp;
      for (let i = 0; i < N_SPARK; i++) {
        sAge[i] += sdt;
        sZ[i] -= sV[i] * sdt * warp;
        sX[i] += Math.sin(t * 0.3 + sPh[i]) * 0.15 * sdt;
        if (sZ[i] - P.camZ < 1.2) respawnSpark(i, false);
      }
    }

    function plot(sx, sy, size, r, g, b) {
      let x0 = Math.round(sx - size * 0.5), y0 = Math.round(sy - size * 0.5);
      let x1 = x0 + size, y1 = y0 + size;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > bw) x1 = bw; if (y1 > bh) y1 = bh;
      for (let y = y0; y < y1; y++) {
        let o = (y * bw + x0) << 2;
        for (let x = x0; x < x1; x++, o += 4) { pix[o] += r; pix[o + 1] += g; pix[o + 2] += b; }
      }
    }
    // A short streak (for fast particles): dots along a line, fading toward the tail.
    function streak(xa, ya, xb, yb, r, g, b) {
      const n = Math.min(28, Math.max(1, Math.round(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)))));
      for (let k = 0; k <= n; k++) {
        const q = k / n, w = 0.2 + 0.8 * q;
        plot(xa + (xb - xa) * q, ya + (yb - ya) * q, 1, r * w, g * w, b * w);
      }
    }

    function renderBuffer() {
      pix32.fill(OPAQUE_BLACK);
      const cxb = bw * 0.5, cyb = bh * 0.5;
      const camX = P.camX, camY = P.camY, camZ = P.camZ;
      const vis0 = P.gain;
      const bulge = P.bulge, ripple = P.ripple;
      const ripR = ripple * 15, ripA = ripple >= 0 ? 1.7 * Math.exp(-ripple * 0.8) : 0;
      const rip2R = (ripple - 1.2) * 13, rip2A = ripple >= 1.2 ? 1.0 * Math.exp(-(ripple - 1.2) * 0.8) : 0;
      const scan = P.scan, scanY = P.scanY, red = P.red, rift = P.rift;
      const swellTh = 0.45 * Math.sin(t * 0.09), breathe = P.breathe;
      const climbOn = P.climb > 0.01;

      // Per-column values.
      for (let c = 0; c < COLS; c++) {
        let th = cTh[c];
        // The rift pushes the columns away from the centre line (more for the ones near it).
        if (rift > 0.001) th += (th < 0 ? -1 : 1) * RIFT * rift * Math.exp(-Math.abs(th) / 0.3);
        colS[c] = Math.sin(th); colC[c] = Math.cos(th); colArc[c] = th * R;
        colVis[c] = clamp((P.reveal * 1.45 - cReveal[c]) * 3.2, 0, 1) * vis0;
        colBul[c] = bulge > 0.01 ? bulge * Math.exp(-(colArc[c] * colArc[c]) / 220) : 0; // Gaussian, width ~10 units
        const ds = (th - P.sweepTh) / 0.07;
        colLight[c] = P.sweep > 0.01 ? P.sweep * Math.exp(-ds * ds) : 0;
        const dw = (th - swellTh) / 0.2;
        colSwell[c] = P.swell * Math.exp(-dw * dw);
        colLip[c] = rift > 0.001 ? rift * Math.exp(-Math.abs(cTh[c]) / 0.05) : 0;
        // Intro: light climbs each column, starting in the middle of the wall and spreading out.
        colClimb[c] = Y_BOT + (introT - 2.0 - 2.6 * Math.abs(cU[c])) * 13;
      }

      // Per-row values for this frame (shared by all columns).
      for (let j = 0; j < ROWS; j++) {
        const y = rowY[j], dy = y + 1.5;
        rowSwell[j] = 0.6 + 0.4 * Math.sin(y * 0.22 + t * 0.5);
        rowBul[j] = Math.exp(-(dy * dy) / 110);
        if (scan > 0.01) { const q = (y - scanY) / 1.25; rowBand[j] = scan * Math.exp(-q * q); } else rowBand[j] = 0;
      }

      // The wall voxels, column by column.
      for (let c = 0; c < COLS; c++) {
        const vis = colVis[c];
        if (vis < 0.004) continue;
        const sn = colS[c], cs = colC[c], arc = colArc[c], top = cTop[c], gain = cGain[c] * vis;
        const swell = colSwell[c], bul = colBul[c], lightC = colLight[c], lip = colLip[c], climbY = colClimb[c];
        // Breathing: d = breathe * sin(a + 0.14 y), split as sin(a)cos(b) + cos(a)sin(b).
        const ba = t * 0.42 + cTh[c] * 2.4, bS = breathe * Math.sin(ba), bC = breathe * Math.cos(ba);
        const ph = cF1[c] * Y_BOT - cPat[c] * t + cPh[c];
        let ps = Math.sin(ph), pc = Math.cos(ph);
        const rs = Math.sin(cF1[c] * DY), rc = Math.cos(cF1[c] * DY);
        const cr0 = cR[c], cg0 = cG[c], cb0 = cB[c];
        for (let j = 0, idx = c * ROWS; j < ROWS; j++, idx++) {
          let q = 0.5 + 0.5 * ps;
          const nps = ps * rc + pc * rs; pc = pc * rc - ps * rs; ps = nps;
          const y = rowY[j], topD = top - y;
          if (topD < 0) break;
          if (topD < 1.8 && cellR[idx] > topD / 1.8) continue; // the top edge frays
          // How far this voxel is pushed toward the viewer (along the wall's inward normal).
          let d = -cellDep[idx] + bS * rowCos[j] + bC * rowSin[j] + swell * rowSwell[j];
          let crest = 0;
          if (bul > 0) { const db = bul * rowBul[j]; d += db; crest = db / 11; }
          if (ripA > 0) {
            const dy = y + 1.5, dist = Math.sqrt(arc * arc + dy * dy);
            const q1 = (dist - ripR) / 1.6, q2 = (dist - rip2R) / 1.6;
            d += ripA * Math.exp(-q1 * q1) + rip2A * Math.exp(-q2 * q2);
          }
          const band = rowBand[j];
          d += band * 0.8 + red * 1.2;
          // Position in 3D (a cylinder of radius R - d), then relative to the camera.
          const rr = R - d;
          const z = D - R + rr * cs - camZ;
          if (z < NEAR) continue;
          // Pinhole projection: divide by depth.
          const inv = fb / z;
          const sx = cxb + (rr * sn - camX) * inv;
          const sy = cyb - (y - camY) * inv;
          if (sx < -8 || sx > bw + 8 || sy < -8 || sy > bh + 8) continue;
          // Brightness: a dim lattice everywhere, sharp streaks where the light passes.
          q *= q; q *= q;
          let b = cellB[idx] * gain * (0.11 + 1.25 * q) * rowFade[j];
          if (topD < 2.4) b *= (topD / 2.4) * (0.4 + 0.6 * topD / 2.4);
          let light = crest * 0.9 + band * 1.8 + lip * 2.2;
          if (lightC > 0.01) light += lightC * (0.5 + 0.5 * Math.sin(y * 0.9 - t * 5));
          if (climbOn) { const q3 = (y - climbY) / 1.8; light += P.climb * Math.exp(-q3 * q3); }
          if (light > 0.005) b = b * (1 + light) + light * 0.28 * vis;
          if (b < 0.008) continue;
          // Colour: the column colour, tinted by the events.
          let r = cr0, g = cg0, bl = cb0;
          if (crest > 0.02) { const m = Math.min(1, crest * 0.45); r += (255 - r) * m; g += (120 - g) * m; bl += (215 - bl) * m; }
          if (band > 0.02) { const m = band * 0.75; r += (110 - r) * m; g += (245 - g) * m; bl += (255 - bl) * m; }
          if (lip > 0.02) { const m = Math.min(1, lip * 0.6); r += (255 - r) * m; g += (235 - g) * m; bl += (255 - bl) * m; }
          if (red > 0.01) { const m = red * 0.85; r += (255 - r) * m; g += (24 - g) * m; bl += (48 - bl) * m; }
          // Size: a fixed voxel edge shrinks as 1/z. Sub-pixel voxels are drawn dimmer instead.
          let size = VOX * inv;
          if (size < 1) { b *= size; size = 1; }
          const si = size > 5.5 ? 6 : (size + 0.5) | 0;
          plot(sx, sy, si, r * b, g * b, bl * b);
        }
      }

      // Loose particles.
      for (let i = 0; i < N_FREE; i++) {
        const life = pLife[i];
        if (life <= 0) continue;
        const z = pZ[i] - camZ;
        if (z < NEAR) continue;
        const inv = fb / z;
        const sx = cxb + (pX[i] - camX) * inv, sy = cyb - (pY[i] - camY) * inv;
        if (sx < -30 || sx > bw + 30 || sy < -30 || sy > bh + 30) continue;
        const age = pMax[i] - life;
        let a = Math.min(1, age * 4) * Math.min(1, life / (pMax[i] * 0.6)) * vis0;
        if (pK[i] === 1) {
          // Fast stream particle: draw a streak from where it was a moment ago.
          const zt = z - pVz[i] * 0.035;
          const it = fb / zt;
          const tx = cxb + (pX[i] - pVx[i] * 0.035 - camX) * it, ty = cyb - (pY[i] - pVy[i] * 0.035 - camY) * it;
          a *= 1.2;
          streak(tx, ty, sx, sy, pR[i] * a, pG[i] * a, pB[i] * a);
        } else {
          let size = 0.11 * inv;
          if (size < 1) { a *= size; size = 1; }
          plot(sx, sy, size > 2.5 ? 3 : (size + 0.5) | 0, pR[i] * a, pG[i] * a, pB[i] * a);
        }
      }

      // Sparks.
      const sp = P.spark;
      if (sp > 0.01) {
        for (let i = 0; i < N_SPARK; i++) {
          const z = sZ[i] - camZ;
          if (z < NEAR) continue;
          const inv = fb / z;
          const sx = cxb + (sX[i] - camX) * inv, sy = cyb - (sY[i] - camY) * inv;
          if (sx < -20 || sx > bw + 20 || sy < -20 || sy > bh + 20) continue;
          let a = sp * Math.min(1, sAge[i] * 0.7) * (0.55 + 0.45 * Math.sin(t * 2.6 + sPh[i] * 3)) * Math.min(1, 9 / z);
          const fast = sV[i] * (1 + 9 * P.warp);
          if (fast * 0.05 * inv > 1.5) {
            const zt = z + fast * 0.05, it = fb / zt;
            streak(cxb + (sX[i] - camX) * it, cyb - (sY[i] - camY) * it, sx, sy, sR[i] * a, sG[i] * a, sB[i] * a);
          } else {
            const size = 0.07 * inv;
            if (size < 1) a *= Math.max(0.35, size);
            plot(sx, sy, size > 2.5 ? 3 : size > 1.5 ? 2 : 1, sR[i] * a, sG[i] * a, sB[i] * a);
          }
        }
      }
    }

    // ---------- Putting the frame on screen ----------
    function composite() {
      bctx.putImageData(img, 0, 0);
      h1c.drawImage(buf, 0, 0, h1.width, h1.height);
      h2c.drawImage(h1, 0, 0, h2.width, h2.height);
      h3c.drawImage(h2, 0, 0, h3.width, h3.height);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      const hz = P.gain * P.reveal * 0.9 * Math.min(1, P.crisp * 2);
      if (hz > 0.003) { ctx.globalAlpha = hz; ctx.drawImage(haze, 0, 0, W, H); }

      ctx.globalCompositeOperation = 'lighter';
      const inside = mode === 'inside';
      const crisp = P.crisp;
      ctx.imageSmoothingEnabled = false;
      if (P.glitch > 0.02) {
        // RGB split: the red part and the green+blue part are drawn a few pixels apart.
        gRc.globalCompositeOperation = 'copy'; gRc.drawImage(buf, 0, 0);
        gRc.globalCompositeOperation = 'multiply'; gRc.fillStyle = '#ff0000'; gRc.fillRect(0, 0, bw, bh);
        gCc.globalCompositeOperation = 'copy'; gCc.drawImage(buf, 0, 0);
        gCc.globalCompositeOperation = 'multiply'; gCc.fillStyle = '#00ffff'; gCc.fillRect(0, 0, bw, bh);
        const dx = 7 * P.glitch;
        ctx.globalAlpha = crisp;
        ctx.drawImage(gR, dx, 0, W, H);
        ctx.drawImage(gC, -dx, 0, W, H);
      } else {
        ctx.globalAlpha = crisp;
        ctx.drawImage(buf, 0, 0, W, H);
      }
      ctx.imageSmoothingEnabled = true;
      // In 'inside' the crisp alpha also caps the glow, so no part of the wall gets bright.
      const bl = P.bloom * Math.min(1, crisp * 1.4);
      ctx.globalAlpha = 0.55 * bl; ctx.drawImage(h2, 0, 0, W, H);
      ctx.globalAlpha = 0.75 * bl; ctx.drawImage(h3, 0, 0, W, H);

      // Light pouring through the rift: a tall soft ellipse (cyan core, pink rim).
      if (P.rift > 0.01) {
        const zc = D - P.camZ;
        const cx = W / 2 - f * P.camX / zc;
        const half = f * R * Math.sin(RIFT * P.rift) / zc;
        const yTop = H / 2 - f * (Y_TOP - P.camY) / zc;
        const a = P.rift * P.gain * (mode === 'granted' ? 0.9 : 0.5);
        ctx.save();
        ctx.translate(cx, (yTop + H) / 2 + H * 0.05);
        ctx.scale(Math.max(2, half * 0.85), (H - yTop) * 0.62);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(235,255,255,' + a.toFixed(3) + ')');
        g.addColorStop(0.25, 'rgba(63,243,255,' + (a * 0.55).toFixed(3) + ')');
        g.addColorStop(0.65, 'rgba(255,46,136,' + (a * 0.18).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,46,136,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }

      // Horizontal tears during the glitch: strips of the image shifted sideways.
      if (P.glitch > 0.15) {
        if (clock - tearsAt > 0.16) {
          tearsAt = clock;
          for (let k = 0; k < 3; k++) {
            tears[k * 3] = Math.random() * H * 0.9;
            tears[k * 3 + 1] = 3 + Math.random() * 22;
            tears[k * 3 + 2] = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 60);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        for (let k = 0; k < 3; k++) {
          const y = Math.round(tears[k * 3] * dpr), h = Math.max(1, Math.round(tears[k * 3 + 1] * dpr));
          const dx = Math.round(tears[k * 3 + 2] * P.glitch * dpr);
          ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Monitor overlay: scan lines and vignette, plus a faint band rolling down the screen.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(overlay, 0, 0, W, H);
      if (!still && !inside) {
        const ry = ((clock * 0.11) % 1.3 - 0.15) * H;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.035 * P.gain;
        const rg = ctx.createLinearGradient(0, ry, 0, ry + H * 0.12);
        rg.addColorStop(0, 'rgba(255,90,176,0)');
        rg.addColorStop(0.5, 'rgba(255,90,176,1)');
        rg.addColorStop(1, 'rgba(255,90,176,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, ry, W, H * 0.12);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    function updateCamera() {
      // A very slow drift of the camera so the wall never looks frozen.
      P.camX = 0.8 * Math.sin(t * 0.05);
      P.camY = 0.4 * Math.sin(t * 0.037 + 1);
    }

    // ---------- Main loop ----------
    function step(dt) {
      clock += dt;
      modeT += dt;
      if (introOn) {
        introT += dt;
        introValues(introT);
        t += dt;
        if (introT >= 12.2) finishIntro();
      } else {
        modeValues(dt);
        t += dt * P.ts;
      }
      updateCamera();
      simulate(dt);
      renderBuffer();
      composite();
    }

    function frame(now) {
      raf = 0;
      if (dead) return;
      let dt = (now - lastNow) / 1000;
      lastNow = now;
      if (!(dt > 0)) dt = 1 / 60;
      if (dt > 0.1) dt = 0.1; // after a pause, do not jump ahead
      schedule();
      // Behind the private page, 30 frames per second is plenty and saves power.
      if (mode === 'inside' && !introOn && P.gain < 0.45) {
        pendingDt += dt;
        if (pendingDt < 0.03) return;
        dt = Math.min(0.1, pendingDt);
      }
      pendingDt = 0;
      step(dt);
    }
    function schedule() {
      if (!raf && !dead && !still && !document.hidden) raf = requestAnimationFrame(frame);
    }

    // ---------- Reduced motion: one calm static frame ----------
    function drawStill() {
      if (dead) return;
      const m = mode;
      P.gain = started ? (m === 'inside' ? 0.38 : 1) : 0.9;
      P.reveal = 1; P.camZ = 0; P.spark = m === 'inside' ? 0.2 : 0.8;
      P.bulge = 0; P.ripple = -1; P.climb = 0; P.sweep = 0; P.glitch = 0; P.warp = 0;
      P.breathe = 0.5; P.swell = 1.3; P.ts = 1; P.shed = 1;
      P.bloom = m === 'inside' ? 0.3 : 1;
      P.crisp = m === 'inside' ? 0.22 : 1;
      P.scan = m === 'scan' ? 1 : 0; P.scanY = 0;
      P.red = m === 'denied' ? 0.6 : 0;
      P.rift = m === 'granted' ? 1 : 0;
      t = 40; introT = 99;
      updateCamera();
      renderBuffer();
      composite();
    }
    function warmUp() {
      const save = mode;
      mode = 'idle';
      P.gain = 1; P.reveal = 1; P.camZ = 0; P.shed = 1; P.ts = 1; P.bulge = 0;
      t = 36;
      renderBuffer(); // fills the per-column values used by the spawner
      for (let k = 0; k < 120; k++) { t += 1 / 30; simulate(1 / 30); }
      mode = save;
    }

    // ---------- Public methods ----------
    function finishIntro() {
      if (!introOn) return;
      introOn = false;
      clearTimeout(introTimer);
      introT = 99;
      const next = queued || 'idle';
      queued = null;
      setModeNow(next);
      const res = introResolve;
      introResolve = null;
      if (res) res();
    }

    function intro() {
      if (dead) return Promise.resolve();
      if (introOn && introPromise) return introPromise;
      started = true;
      if (still) {
        drawStill();
        introPromise = new Promise(res => { introTimer = setTimeout(res, 2500); });
        return introPromise;
      }
      introOn = true;
      introT = 0;
      mode = 'idle';
      P.camZ = -18;
      resetParticles();
      introPromise = new Promise(res => { introResolve = res; });
      // Safety net: if the page never gets animation frames (hidden tab), still finish.
      introTimer = setTimeout(finishIntro, 25000);
      lastNow = performance.now();
      schedule();
      return introPromise;
    }

    function setModeNow(m) {
      if (m === 'denied') {
        // At most one red pulse per second (photosensitivity: well under 3 flashes per second).
        deniedAt = Math.max(clock, lastPulse + 1.0);
        lastPulse = deniedAt;
      }
      if (m !== mode || m === 'denied' || m === 'granted') modeT = 0;
      mode = m;
    }

    function setMode(m) {
      if (dead || MODES.indexOf(m) < 0) return;
      started = true;
      if (still) { mode = m; drawStill(); return; }
      if (introOn) {
        if (m === 'granted' || m === 'inside') { queued = m; finishIntro(); }
        else queued = m;
        return;
      }
      setModeNow(m);
      schedule();
    }

    function onResize() {
      resize();
      if (still) drawStill();
    }
    function onVisibility() {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        lastNow = performance.now();
        schedule();
      }
    }

    function destroy() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(introTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (introResolve) { const r = introResolve; introResolve = null; r(); }
    }

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    resize();
    if (still) {
      warmUp();
      drawStill();
    } else {
      // Until intro() or setMode() is called, the canvas shows the empty void.
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      lastNow = performance.now();
      schedule();
    }

    return { intro, setMode, destroy };
  }

  window.GridWall = Object.freeze({ create });
})();
