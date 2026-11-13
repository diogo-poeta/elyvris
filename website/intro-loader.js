/* Show the "Unfolding light" intro (intro-loader.css) once per visit.
   Loaded in <head> without defer, so the classes are set before the page is drawn.
   A "visit" is one browser tab session (sessionStorage). If storage is blocked, the intro simply plays.

   The hero logo (assets/brand/elyvris-mark.svg) animates by itself for about 1.8 s from the moment
   it loads, which is hidden behind the intro. So while the intro plays the logo is hidden, and when
   the intro ends the logo is loaded again, which restarts its animation in view. */
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
    // If the intro's wipe animation is not running (for example, the stylesheet failed to load), show the logo now.
    if (!loader || !/\bld-out\b/.test(getComputedStyle(loader).animationName)) { reveal(); return; }
    // The wipe's "finished" promise resolves even if it ended before this line ran; cancelled also counts as done.
    const wipe = loader.getAnimations ? loader.getAnimations().find((a) => a.animationName === 'ld-out') : null;
    if (wipe) wipe.finished.then(reveal, reveal);
    else loader.addEventListener('animationend', (event) => { if (event.animationName === 'ld-out') reveal(); });
    setTimeout(reveal, 8000); // last resort only; normally the wipe ends after about 1.9 s
  });
})();
