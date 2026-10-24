/* Public, read-only research records. No upload, draft or storage API.
 * records-data.json contains published entries only. Future media must have
 * a cleared rights status, a caption and alternative text before rendering.
 * Images are restricted to local raster files under assets/; public references
 * may link to external HTTPS pages, but never carry URL credentials.
 * Private permission correspondence does not belong in this public dataset.
 */
(() => {
  'use strict';
  const list = document.querySelector('#records-list');
  const status = document.querySelector('#record-count');
  const error = document.querySelector('#records-error');
  const filters = [...document.querySelectorAll('.record-filters button')];
  if (!list || !status || !error) return;
  const categories = Object.freeze({ laboratory: 'Laboratory', presentation: 'Presentation', affiliation: 'Affiliation', 'academic-visit': 'Academic visit' });
  let records = [];
  let active = 'all';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function publicURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      if (url.username || url.password) return null;
      return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === location.protocol) ? url : null;
    } catch { return null; }
  }
  function localImageURL(value) {
    // Explicit asset paths exclude remote trackers, SVG/document links,
    // encoded paths and query-based endpoints before the browser loads media.
    if (typeof value !== 'string' || !/^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-][a-z0-9_.-]*\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) return null;
    const url = publicURL(value);
    const assets = new URL('assets/', location.href);
    return url && url.origin === location.origin && url.pathname.startsWith(assets.pathname) && !url.search && !url.hash ? url : null;
  }
  function referenceLink(reference) {
    const url = publicURL(reference.url);
    if (!url) return null;
    const link = element('a', '', reference.label);
    link.href = url.href;
    if (url.origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    const arrow = element('span', '', ' ↗'); arrow.setAttribute('aria-hidden', 'true'); link.append(arrow);
    return link;
  }
  function dateValue(value, precision) {
    if (precision === 'year') return value.slice(0, 4);
    const date = new Date(value + (precision === 'month' ? '-01' : '') + 'T12:00:00Z');
    return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', ...(precision === 'day' ? { day: 'numeric' } : {}), timeZone: 'UTC' }).format(date);
  }
  function dateLabel(date) {
    const start = dateValue(date.start, date.precision);
    return date.end && date.end !== date.start ? start + ' — ' + dateValue(date.end, date.precision) : start;
  }
  function appendMedia(container, media) {
    const approved = media.filter(image => image && image.rights?.status === 'cleared' && typeof image.alt === 'string' && image.alt.trim() && typeof image.caption === 'string' && image.caption.trim() && Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0 && localImageURL(image.src));
    if (!approved.length) return;
    const gallery = element('div', 'record-media');
    approved.forEach(image => {
      const figure = document.createElement('figure');
      const url = localImageURL(image.src);
      const link = element('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', 'Open full image: ' + image.alt);
      const photo = element('img'); photo.src = url.href; photo.alt = image.alt; photo.width = image.width; photo.height = image.height; photo.loading = 'lazy'; photo.decoding = 'async'; photo.referrerPolicy = 'no-referrer'; link.append(photo);
      const caption = document.createElement('figcaption'); caption.append(element('p', '', image.caption));
      const credits = [];
      if (image.dateTaken?.value && image.dateTaken?.precision) credits.push(dateValue(image.dateTaken.value, image.dateTaken.precision));
      if (typeof image.credit === 'string' && image.credit.trim()) credits.push(image.credit);
      if (typeof image.rights.license === 'string' && image.rights.license.trim()) credits.push(image.rights.license);
      if (credits.length) caption.append(element('p', 'record-media-credit', credits.join(' · ')));
      figure.append(link, caption); gallery.append(figure);
    });
    container.append(gallery);
  }
  function renderRecord(record) {
    const article = element('article', 'record-entry'); article.id = record.id; article.dataset.category = record.category;
    const meta = element('div', 'record-entry-meta');
    const date = element('p', 'record-entry-date', dateLabel(record.date));
    meta.append(date, element('span', 'record-entry-category', [categories[record.category], record.format].filter(Boolean).join(' · ')));
    const body = element('div', 'record-entry-body');
    const heading = element('h2', '', record.title); heading.id = record.id + '-title'; article.setAttribute('aria-labelledby', heading.id); body.append(heading);
    const locationLine = element('p', 'record-location');
    [record.event, record.institution, record.place?.label].filter(Boolean).forEach(value => locationLine.append(element('span', '', value)));
    if (locationLine.childNodes.length) body.append(locationLine);
    body.append(element('p', 'record-summary', record.summary));
    if (record.activities?.length) {
      const activities = element('ul', 'record-activities'); record.activities.forEach(value => activities.append(element('li', '', value))); body.append(activities);
    }
    if (record.methods?.length) {
      const methods = element('ul', 'record-methods'); methods.setAttribute('aria-label', 'Methods and research subjects'); record.methods.forEach(value => methods.append(element('li', '', value))); body.append(methods);
    }
    appendMedia(body, record.media || []);
    if (record.references?.length) {
      const references = element('div', 'record-reference-list');
      record.references.forEach(reference => { const link = referenceLink(reference); if (link) references.append(link); });
      if (references.childNodes.length) body.append(references);
    }
    article.append(meta, body); return article;
  }
  function updateFilter() {
    let count = 0;
    [...list.children].forEach(article => { article.hidden = active !== 'all' && article.dataset.category !== active; if (!article.hidden) count++; });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === active)));
    const label = active === 'all' ? '' : ' · ' + (active === 'presentation' ? 'Presentations' : active === 'affiliation' ? 'Affiliations' : categories[active]);
    status.textContent = count + (count === 1 ? ' record' : ' records') + label;
  }
  function validRecord(record) {
    const precision = record?.date?.precision;
    const pattern = precision === 'year' ? /^\d{4}$/ : precision === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    return record && record.status === 'published' && Object.hasOwn(categories, record.category) && typeof record.id === 'string' && /^[a-z][a-z0-9-]+$/.test(record.id) && typeof record.title === 'string' && record.title.trim() && typeof record.summary === 'string' && ['year', 'month', 'day'].includes(precision) && pattern.test(record.date.start) && (!record.date.end || pattern.test(record.date.end));
  }
  filters.forEach(button => button.addEventListener('click', () => { active = button.dataset.category; updateFilter(); }));
  fetch('records-data.json', { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error('Record data is unavailable.'); return response.json();
  }).then(data => {
    if (data.schemaVersion !== 1 || !Array.isArray(data.records) || !data.records.length || !data.records.every(validRecord)) throw new Error('Record data has an unsupported structure.');
    records = [...data.records].sort((a,b) => (b.date.end || b.date.start).localeCompare(a.date.end || a.date.start));
    if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Record identifiers must be unique.');
    const fragment = document.createDocumentFragment(); records.forEach(record => fragment.append(renderRecord(record))); list.replaceChildren(fragment); list.setAttribute('aria-busy', 'false');
    filters.forEach(button => {
      const total = button.dataset.category === 'all' ? records.length : records.filter(record => record.category === button.dataset.category).length;
      const count = element('span', 'record-filter-count', String(total)); count.setAttribute('aria-hidden', 'true'); button.append(count); button.disabled = false;
    });
    updateFilter();
  }).catch(() => { list.setAttribute('aria-busy', 'false'); status.textContent = 'Record unavailable'; error.hidden = false; });
})();
