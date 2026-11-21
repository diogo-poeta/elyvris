(() => {
  'use strict';
  const button = document.getElementById('app-install');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* the Studio works without it, only not offline */ }); });
  }
  if (!button) return;
  let offer = null;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); offer = event; button.hidden = false; });
  button.addEventListener('click', async () => {
    if (!offer) return;
    offer.prompt();
    try { await offer.userChoice; } catch (error) { /* closed */ }
    offer = null; button.hidden = true;
  });
  window.addEventListener('appinstalled', () => { offer = null; button.hidden = true; });
})();
