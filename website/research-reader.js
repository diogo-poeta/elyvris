/* Research page: open an article's PDF inside the page (research.html, papers.css).
   Each card is a normal link to the PDF. On a wide screen, with a browser that can show PDFs,
   a click opens the PDF in the reader below the cards, using the browser's own PDF viewer.
   On a phone (or if the browser cannot show PDFs) the link simply opens the PDF as usual.
   A link such as research.html#ome-2026 opens that article directly. */
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
    // Load the PDF only when asked, so the page itself stays light. "#view=FitH" fits the page width.
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
