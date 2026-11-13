/* Show the "Unfolding light" intro (intro-loader.css) once per visit.
   Loaded in <head> without defer, so the class is set before the page is drawn.
   A "visit" is one browser tab session (sessionStorage). If storage is blocked, the intro simply plays. */
(function () {
  'use strict';
  try {
    if (sessionStorage.getItem('elyvris-intro-seen')) document.documentElement.classList.add('ey-seen');
    else sessionStorage.setItem('elyvris-intro-seen', '1');
  } catch (error) { /* storage unavailable: show the intro */ }
})();
