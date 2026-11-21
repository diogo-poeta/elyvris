(function () {
  'use strict';
  const viewer = document.querySelector('.studio-page .viewer');
  if (!viewer) return;

  function eye(cx, cy) {
    return '<g class="sc-look" data-cx="' + cx + '" data-cy="' + cy + '">' +
      '<ellipse class="sc-pupil" cx="' + cx + '" cy="' + cy + '" rx="3.2" ry="3.8"/>' +
      '<circle class="sc-shine" cx="' + (cx - 1) + '" cy="' + (cy - 1.4) + '" r="1.1"/>' +
      '<circle class="sc-shine" cx="' + (cx + 1.1) + '" cy="' + (cy + 1.3) + '" r=".5"/></g>';
  }

  const svg = [
    '<svg class="sc-art" viewBox="0 0 170 100" focusable="false" aria-hidden="true">',
    '  <defs>',
    // White fur, lit from the upper left, with cool grey in the shadows.
    '    <radialGradient id="sc-g-fur" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F7F4EF"/><stop offset="1" stop-color="#D9DCDF"/></radialGradient>',
    '    <linearGradient id="sc-g-cup" x1="0" x2="1"><stop offset="0" stop-color="#4A9496"/><stop offset=".55" stop-color="#2E6E70"/><stop offset="1" stop-color="#1D4A4C"/></linearGradient>',
    '    <radialGradient id="sc-g-coffee" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#B57E4C"/><stop offset="1" stop-color="#7A4C27"/></radialGradient>',
    // Fuzzy edges: a fine noise pushes the outline about, so it reads as fur.
    '    <filter id="sc-fuzz" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="1" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.3" xChannelSelector="R" yChannelSelector="G"/></filter>',
    '    <filter id="sc-hand" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1" xChannelSelector="R" yChannelSelector="G"/></filter>',
    '    <filter id="sc-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1"/></filter>',
    '  </defs>',
    // Steam above the cup.
    '  <g class="sc-steam" filter="url(#sc-soft)">',
    '    <path d="M119 68 c-5 -6 5 -10 0 -16 c-5 -6 5 -10 0 -16"/>',
    '    <path d="M127 68 c-5 -6 5 -10 0 -16 c-5 -6 5 -10 0 -16"/>',
    '    <path d="M135 68 c-5 -6 5 -10 0 -16 c-5 -6 5 -10 0 -16"/>',
    '  </g>',
    // The cup: teal, with a thin amber line, on a white saucer, with a latte heart.
    '  <g class="sc-cup" filter="url(#sc-hand)">',
    '    <ellipse class="sc-saucer" cx="127" cy="96.4" rx="23" ry="3.6"/>',
    '    <path class="sc-handle-line" d="M145 78 c9 -1 10 11 -1 11"/>',
    '    <path class="sc-handle" d="M145 78 c9 -1 10 11 -1 11"/>',
    '    <path class="sc-bowl" d="M108 74 C108 89 116 95 127 95 C138 95 146 89 146 74 Z"/>',
    '    <path class="sc-gold" d="M110 80 C120 83.5 134 83.5 144 80"/>',
    '    <path class="sc-gleam" d="M112.5 80 C113.5 86 116 89.5 119.5 91.5"/>',
    '    <ellipse class="sc-rim" cx="127" cy="74" rx="19" ry="4.6"/>',
    '    <ellipse class="sc-coffee" cx="127" cy="74.6" rx="16" ry="3.4"/>',
    '    <path class="sc-latte" d="M127 76.8 c-1.6 -1 -3.6 -1.7 -3.4 -2.7 c.2 -1 2 -1 3.4 .2 c1.4 -1.2 3.2 -1.2 3.4 -.2 c.2 1 -1.8 1.7 -3.4 2.7 z"/>',
    '  </g>',
    // The cat: one round shape for head and body, ears, face, paws and tail.
    '  <g class="sc-cat">',
    '    <g class="sc-body">',
    '      <g filter="url(#sc-fuzz)">',
    '        <g class="sc-ear sc-ear-l"><path class="sc-fur" d="M17 46 C15 34 16 24 20 16.5 C27 20.5 33 25.5 37 30 Z"/><path class="sc-inner" d="M20.5 38 C19.5 31 20.5 26 22.5 22 C26 24.5 29 27.5 31 30.5 Z"/></g>',
    '        <g class="sc-ear sc-ear-r"><path class="sc-fur" d="M75 46 C77 34 76 24 72 16.5 C65 20.5 59 25.5 55 30 Z"/><path class="sc-inner" d="M71.5 38 C72.5 31 71.5 26 69.5 22 C66 24.5 63 27.5 61 30.5 Z"/></g>',
    '        <path class="sc-fur" d="M10 99 C6 82 8 62 14 50 C17 36 28 27 46 27 C64 27 75 36 78 50 C84 62 86 82 82 99 Z"/>',
    '        <path class="sc-tufts" d="M11.5 62 l-4 -1.5 M10.5 67 l-4.2 .8 M11 72 l-3.6 2 M80.5 62 l4 -1.5 M81.5 67 l4.2 .8 M81 72 l3.6 2 M42 27.5 l.6 -3.5 M46 27 v-4 M50 27.5 l-.6 -3.5"/>',
    '      </g>',
    '      <path class="sc-shade" d="M62 58 C75 64 81 80 80 98 L58 98 C65 86 66 70 62 58 Z" filter="url(#sc-soft)"/>',
    '      <path class="sc-chest" d="M65 74 l3 2.4 M69.5 80 l3 2.2 M63.5 85 l3 2.2 M70 89 l3 2 M75 84 l2.6 2"/>',
    '    </g>',
    '    <g class="sc-face">',
    '      <ellipse class="sc-blush" cx="30.5" cy="62.5" rx="6.5" ry="3.6" filter="url(#sc-soft)"/>',
    '      <ellipse class="sc-blush" cx="61.5" cy="62.5" rx="6.5" ry="3.6" filter="url(#sc-soft)"/>',
    '      <path class="sc-closed" d="M33 55 q4.5 3.4 9 0 M50 55 q4.5 3.4 9 0"/>',
    '      <g class="sc-open-eyes">' + eye(37.5, 55) + eye(54.5, 55) + '</g>',
    '      <path class="sc-squeeze" d="M33 54 l7.5 2 l-7.5 2 M59 54 l-7.5 2 l7.5 2"/>',
    '      <path class="sc-nose" d="M44 59.5 q2 -.9 4 0 q-.6 1.6 -2 2.1 q-1.4 -.5 -2 -2.1 z"/>',
    '      <path class="sc-mouth" d="M46 61.6 q-2 2.6 -4.4 1.2 M46 61.6 q2 2.6 4.4 1.2"/>',
    '      <g class="sc-meow-mouth"><path class="sc-open" d="M42.5 62.3 q3.5 8 7 0 q-3.5 1.4 -7 0 z"/><path class="sc-tongue" d="M44 65.9 q2 1.8 4 0 q-2 -1 -4 0 z"/></g>',
    '      <path class="sc-whisker" d="M30 61 L17 59 M30 63.5 L18 65.5 M62 61 L75 59 M62 63.5 L74 65.5"/>',
    '    </g>',
    '    <g class="sc-tail"><path class="sc-tail-line" d="M76 98.5 C86 99 90.5 92 89 84 C88 78 88.5 74 92 72"/><path class="sc-tail-fur" d="M76 98.5 C86 99 90.5 92 89 84 C88 78 88.5 74 92 72"/></g>',
    '    <g class="sc-paws" filter="url(#sc-fuzz)">',
    '      <ellipse class="sc-paw" cx="38" cy="97" rx="6.2" ry="3.4"/><ellipse class="sc-paw" cx="54" cy="97" rx="6.2" ry="3.4"/>',
    '      <path class="sc-toes" d="M36 96.5 v2.4 M40 96.5 v2.4 M52 96.5 v2.4 M56 96.5 v2.4"/>',
    '    </g>',
    '    <path class="sc-heart" d="M46 14 c-2 -3 -6 -2 -6 1.5 c0 3 6 6.5 6 6.5 s6 -3.5 6 -6.5 c0 -3.5 -4 -4.5 -6 -1.5 z"/>',
    '  </g>',
    // The meow: just the word, in black, beside the head.
    '  <text class="sc-meow" x="79" y="36">Meow!</text>',
    '</svg>'
  ].join('');

  const box = document.createElement('div');
  box.className = 'sc-companion';
  box.innerHTML = svg;
  viewer.classList.add('has-companion');
  viewer.prepend(box);

  const cat = box.querySelector('.sc-cat');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let awakeTimer = 0;
  function wake(ms) {
    box.classList.add('is-awake');
    clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => box.classList.remove('is-awake'), ms);
  }

  // Hovering or tapping the cat: it opens its eyes, looks at you, and a small heart rises.
  function pet() {
    if (box.classList.contains('is-meowing')) return;
    wake(2200);
    box.classList.remove('is-happy');
    void box.offsetWidth; // restart the heart animation
    box.classList.add('is-happy');
    setTimeout(() => box.classList.remove('is-happy'), 1700);
  }

  // Count taps and clicks; the fifth one in a row (no pause longer than 4 s) gives a meow.
  let taps = 0;
  let tapTimer = 0;
  function meow() {
    clearTimeout(awakeTimer);
    box.classList.remove('is-awake', 'is-happy');
    box.classList.add('is-meowing');
    setTimeout(() => box.classList.remove('is-meowing'), 2000);
  }
  cat.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') pet(); });
  cat.addEventListener('click', () => {
    clearTimeout(tapTimer);
    taps += 1;
    if (taps >= 5) { taps = 0; meow(); return; }
    pet();
    tapTimer = setTimeout(() => { taps = 0; }, 4000);
  });

  if (reduced) return;

  // Open eyes follow the pointer: at most 0.9 units sideways and 0.6 up or down.
  const eyes = Array.from(box.querySelectorAll('.sc-look'));
  let pointer = null;
  let frame = 0;
  function look() {
    frame = 0;
    if (!pointer) return;
    const rect = box.getBoundingClientRect();
    const scale = rect.width / 170; // screen pixels per SVG unit
    eyes.forEach((one) => {
      const cx = rect.left + Number(one.dataset.cx) * scale;
      const cy = rect.top + Number(one.dataset.cy) * scale;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      one.setAttribute('transform', 'translate(' + (0.9 * dx / d).toFixed(2) + ' ' + (0.6 * dy / d).toFixed(2) + ')');
    });
  }
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });

  // Every 9 to 20 seconds the cat peeks: eyes open for about 2.5 s, then close again.
  function peek() {
    if (!box.classList.contains('is-meowing')) wake(2500);
    setTimeout(peek, 9000 + Math.random() * 11000);
  }
  setTimeout(peek, 7000);

  function twitch() {
    const ear = box.querySelector(Math.random() < 0.5 ? '.sc-ear-l' : '.sc-ear-r');
    ear.classList.add('is-twitching');
    setTimeout(() => ear.classList.remove('is-twitching'), 500);
    setTimeout(twitch, 6000 + Math.random() * 8000);
  }
  setTimeout(twitch, 5000);
})();
