(function () {
  'use strict';
  const reader = document.getElementById('reader');
  if (!reader) return;
  const frame = document.getElementById('reader-frame');
  const cards = Array.from(document.querySelectorAll('a.paper'));
  const wide = window.matchMedia('(min-width: 760px)');
  // navigator.pdfViewerEnabled is false when the browser would only download the file.
  const canShowPdf = () => wide.matches && navigator.pdfViewerEnabled !== false;

  function open(card, scroll) {
    const pdf = card.getAttribute('href');
    document.getElementById('reader-title').textContent = card.querySelector('.p-title').textContent;
    document.getElementById('reader-cite').textContent = card.dataset.cite;
    document.getElementById('reader-open').href = pdf;
    document.getElementById('reader-doi').href = card.dataset.doi;
    document.getElementById('reader-notice').textContent = card.dataset.notice;
    const link = document.getElementById('reader-notice-link');
    link.href = card.dataset.doi;
    link.textContent = card.dataset.doi;
    frame.src = pdf + '#view=FitH';
    cards.forEach((c) => c.removeAttribute('aria-current'));
    card.setAttribute('aria-current', 'true');
    reader.hidden = false;
    if (scroll) reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function close() {
    reader.hidden = true;
    frame.removeAttribute('src');
    cards.forEach((c) => c.removeAttribute('aria-current'));
    history.replaceState(null, '', location.pathname);
  }

  cards.forEach((card) => {
    card.addEventListener('click', (event) => {
      if (!canShowPdf() || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      history.replaceState(null, '', '#' + card.parentElement.id);
      open(card, true);
    });
  });
  document.getElementById('reader-close').addEventListener('click', close);

  const fromLink = location.hash && document.querySelector(location.hash + ' > a.paper');
  if (fromLink && canShowPdf()) open(fromLink, true);
})();
