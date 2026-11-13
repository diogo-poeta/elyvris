/*
 * Studio introduction: a short, animated note shown before the Studio opens.
 * Message: if you plan to fabricate, start from your fabrication limits; a thin film
 * (a Fabry–Pérot resonator) can sometimes do the job better than a complex shape.
 *
 * Shown once per browser (remembered in localStorage when available). A "Before you start"
 * button in the Studio header opens it again. Esc, the close button or "Start designing"
 * close it. With reduced motion, everything appears at once and nothing moves.
 */
(function () {
  'use strict';
  const KEY = 'elyvris-studio-intro-seen-v1';
  const head = document.querySelector('.studio-head');
  if (!head) return;

  const dialog = document.createElement('div');
  dialog.className = 'si-backdrop';
  dialog.hidden = true;
  dialog.innerHTML = [
    '<section class="si-card" role="dialog" aria-modal="true" aria-labelledby="si-title">',
    '  <button type="button" class="si-close" aria-label="Close the introduction">×</button>',
    '  <p class="si-kicker">Before you start</p>',
    '  <h2 id="si-title">What is your goal?</h2>',
    '  <svg class="si-art" viewBox="0 0 640 170" role="img" aria-labelledby="si-art-t">',
    '    <title id="si-art-t">Left: a complex nanostructure with small error bars on its edges. Right: a thin film with a ray of light bouncing between its two faces, and the field inside growing at resonance.</title>',
    '    <g class="si-left">',
    '      <rect class="si-sub" x="20" y="118" width="250" height="26"/>',
    '      <path class="si-shape" d="M40 118 V78 H70 V98 H90 V60 H118 V118 Z"/>',
    '      <path class="si-shape" d="M150 118 L162 70 L190 70 L202 118 Z"/>',
    '      <rect class="si-shape" x="222" y="88" width="30" height="30" rx="2"/>',
    '      <path class="si-tol" d="M86 54 H122 M86 50 V58 M122 50 V58"/>',
    '      <path class="si-tol" d="M158 64 H194 M158 60 V68 M194 60 V68"/>',
    '      <text class="si-label" x="20" y="164">complex shapes: every edge has an error</text>',
    '    </g>',
    '    <g class="si-right">',
    '      <rect class="si-sub" x="350" y="118" width="270" height="26"/>',
    '      <rect class="si-film" x="350" y="70" width="270" height="48"/>',
    '      <rect class="si-glow" x="350" y="80" width="270" height="28"/>',
    '      <path class="si-ray" d="M360 20 L384 70 L408 118 L432 70 L456 118 L480 70 L504 118 L528 70 L552 118 L576 70 L600 20"/>',
    '      <text class="si-label" x="350" y="164">a thin film: light bounces between two faces</text>',
    '    </g>',
    '  </svg>',
    '  <ol class="si-steps">',
    '    <li><strong>If you plan to make it, start from what your lab can make.</strong> Every nano- or microfabrication process has limits: the smallest gap, rounded corners, sloped walls, a few nanometres of error in each size. A resonance can move with each of them; the TiO₂ anapole on this site shifts by about 0.8 nm for every nanometre of width.</li>',
    '    <li><strong>A complex structure is not always the better one.</strong> A slab or a thin film can work as well, or better. A film is a Fabry–Pérot resonator: light reflects back and forth between its two faces, and at resonance the field inside builds up. Its thickness can be controlled to below a nanometre, for example by atomic layer deposition.</li>',
    '    <li><strong>An example.</strong> In an air / Ge₂Sb₂Te₅ / gold Fabry–Pérot cavity, third-harmonic generation from a 50 nm amorphous Ge₂Sb₂Te₅ film was 422 times stronger at the cavity resonance than away from it, in the near infrared.<sup>1</sup> In TiO₂ films, the film thickness and growth chemistry alone changed the third-harmonic signal.<sup>2</sup></li>',
    '  </ol>',
    '  <p class="si-goal">So first decide what the structure must do, and whether it can be made. Then draw it.</p>',
    '  <div class="si-actions"><button type="button" class="si-start">Start designing</button></div>',
    '  <p class="si-refs"><sup>1</sup> T. Cao, K. Liu, Y. Tang, J. Deng, K. Li and G. Li, “Giant enhancement of third harmonic generation from Ge<sub>2</sub>Sb<sub>2</sub>Te<sub>5</sub> based Fabry-Perot cavity,” <a href="https://arxiv.org/abs/1901.08795" rel="noopener noreferrer">arXiv:1901.08795</a> (2019); the 422× is relative to non-resonant conditions. <sup>2</sup> D. Poeta et al., <i>Optical Materials Express</i> 16, 3342 (2026), <a href="https://doi.org/10.1364/OME.611814" rel="noopener noreferrer">doi:10.1364/OME.611814</a>; see also <a href="research.html#ome-2026">read it on the Research page</a>.</p>',
    '</section>'
  ].join('\n');
  document.body.append(dialog);

  const card = dialog.querySelector('.si-card');
  let opener = null;

  function open(fromButton) {
    opener = fromButton || null;
    dialog.hidden = false;
    // Restart the entrance animation each time it opens.
    card.classList.remove('si-play');
    void card.offsetWidth;
    card.classList.add('si-play');
    document.documentElement.classList.add('si-lock');
    dialog.querySelector('.si-start').focus();
  }
  function close() {
    dialog.hidden = true;
    document.documentElement.classList.remove('si-lock');
    try { localStorage.setItem(KEY, '1'); } catch (error) { /* storage may be unavailable */ }
    if (opener) opener.focus();
  }

  dialog.querySelector('.si-close').addEventListener('click', close);
  dialog.querySelector('.si-start').addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    // Keep keyboard focus inside the dialog while it is open.
    const items = Array.from(card.querySelectorAll('button, a[href]'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  // "Before you start" button in the Studio header, to open the note again.
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'si-again';
  again.textContent = 'Before you start';
  again.addEventListener('click', () => open(again));
  const tools = head.querySelector('.head-tools');
  (tools || head).prepend(again);

  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (error) { seen = false; }
  if (!seen) open(null);
})();
