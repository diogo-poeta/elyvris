(function () {
  'use strict';
  const root = document.documentElement;
  let seen = false;
  try {
    seen = !!sessionStorage.getItem('elyvris-intro-seen');
    if (!seen) sessionStorage.setItem('elyvris-intro-seen', '1');
  } catch (error) { /* storage unavailable: show the intro */ }
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduced) { root.classList.add('ey-seen'); return; }
  root.classList.add('ey-intro');

  document.addEventListener('DOMContentLoaded', () => {
    const loader = document.querySelector('.ey-loader');
    const logo = document.querySelector('.hero-mark img');
    let finished = false;
    function reveal() {
      if (finished) return;
      finished = true;
      if (logo) logo.src = logo.getAttribute('src').split('?')[0] + '?play=1';
      root.classList.add('ey-done');
    }
    if (!loader || !/\bld-out\b/.test(getComputedStyle(loader).animationName)) { reveal(); return; }
    const wipe = loader.getAnimations ? loader.getAnimations().find((a) => a.animationName === 'ld-out') : null;
    if (wipe) wipe.finished.then(reveal, reveal);
    else loader.addEventListener('animationend', (event) => { if (event.animationName === 'ld-out') reveal(); });
    setTimeout(reveal, 8000); // last resort only; normally the wipe ends after about 1.9 s
  });
})();
