/*
 * Research page, laptop layout: show one part at a time, with a contents list on the left
 * and Previous / Next links at the end of each part.
 *
 * The page is written as one long article. Each part is a <div class="rp" id="..."> with
 * data-num ("Part I") and data-title. On screens narrower than 1000 px, or without
 * JavaScript, nothing changes and the page reads top to bottom.
 *
 * Links to anything inside a hidden part (for example research.html#films, or #fig-14)
 * open that part first and then scroll to the target. The references stay visible
 * under every part, so footnote links always work.
 */
(function () {
  'use strict';
  const main = document.getElementById('main');
  const parts = main ? Array.from(main.querySelectorAll(':scope > .rp')) : [];
  if (parts.length < 2) return;

  const wide = window.matchMedia('(min-width: 1000px)');

  // Aspect ratio of each figure image, used by research-paged.css to keep figures within one screen.
  main.querySelectorAll('.fig img[width][height]').forEach((img) => {
    const w = Number(img.getAttribute('width'));
    const h = Number(img.getAttribute('height'));
    if (w > 0 && h > 0) img.style.setProperty('--ar', String(w / h));
  });
  const label = (p) => (p.dataset.num ? p.dataset.num + ' · ' : '') + p.dataset.title;
  let active = null;

  // Contents list: one entry per part, with its numbered chapters underneath.
  const nav = document.createElement('nav');
  nav.className = 'rp-nav';
  nav.setAttribute('aria-label', 'Contents of this page');
  const heading = document.createElement('p');
  heading.className = 'rp-nav-head';
  heading.textContent = 'Contents';
  const list = document.createElement('ol');
  parts.forEach((part) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'rp-link';
    link.href = '#' + part.id;
    if (part.dataset.num) {
      const num = document.createElement('span');
      num.textContent = part.dataset.num;
      link.append(num);
    }
    link.append(document.createTextNode(part.dataset.title));
    item.append(link);
    const chapters = Array.from(part.querySelectorAll('section[id] > h2'));
    if (chapters.length) {
      const sub = document.createElement('ol');
      sub.className = 'rp-sub';
      chapters.forEach((h2) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + h2.parentElement.id;
        a.textContent = h2.textContent.replace(/\s+/g, ' ').trim();
        li.append(a);
        sub.append(li);
      });
      item.append(sub);
    }
    list.append(item);
  });
  nav.append(heading, list);
  main.prepend(nav);

  // Previous / Next at the end of each part.
  parts.forEach((part, i) => {
    const pager = document.createElement('nav');
    pager.className = 'rp-pager';
    pager.setAttribute('aria-label', 'Previous and next part');
    const make = (target, dir) => {
      const a = document.createElement('a');
      a.href = '#' + target.id;
      a.className = 'rp-' + dir;
      const small = document.createElement('span');
      small.textContent = dir === 'prev' ? '← Previous' : 'Next →';
      const strong = document.createElement('strong');
      strong.textContent = label(target);
      a.append(small, strong);
      return a;
    };
    if (i > 0) pager.append(make(parts[i - 1], 'prev'));
    if (i < parts.length - 1) pager.append(make(parts[i + 1], 'next'));
    part.append(pager);
  });

  function show(part) {
    if (part === active) return;
    active = part;
    parts.forEach((p) => p.classList.toggle('is-active', p === part));
    nav.querySelectorAll('.rp-link').forEach((a) => {
      const on = a.getAttribute('href') === '#' + part.id;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    // Figures that measure themselves (canvas viewers) need to know they are visible now.
    window.dispatchEvent(new Event('resize'));
  }

  function route() {
    if (!wide.matches) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    const part = target ? (target.classList.contains('rp') ? target : target.closest('.rp')) : null;
    show(part || active || parts[0]);
    if (target) {
      const goTo = target.classList.contains('rp') ? main : target;
      requestAnimationFrame(() => goTo.scrollIntoView({ block: 'start' }));
    }
  }

  function applyLayout() {
    main.classList.toggle('paged', wide.matches);
    if (wide.matches) route();
  }

  window.addEventListener('hashchange', route);
  if (wide.addEventListener) wide.addEventListener('change', applyLayout);
  applyLayout();
})();
