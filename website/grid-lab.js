'use strict';
// Grid simulation area: header and the Coating lab.
(() => {
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }
  let active = null;
  function open(root) {
    close();
    if (!window.GridAPI.user()) return;
    const labRoot = el('div', { class: 'cl-root' });
    root.replaceChildren(
      el('div', { class: 'gn-header' }, el('div', {}, el('p', { class: 'gn-eyebrow' }, 'Elyvris · Simulation'),
        el('h1', { id: 'gridLabTitle' }, 'Grid'),
        el('p', { class: 'gn-intro' }, 'Learning agents design a real optical coating: thin layers that stop glass from reflecting light. Every design is scored with an exact optics calculation.')),
        el('nav', { class: 'gn-nav', 'aria-label': 'Inside Grid' }, el('a', { href: '#gridCoatingTitle' }, 'Coating lab ↓'),
          el('a', { href: '#gridSector' }, 'Private sector ↓'))),
      el('section', { 'aria-labelledby': 'gridCoatingTitle' },
        el('h2', { id: 'gridCoatingTitle', class: 'cl-section-title' }, 'Coating lab'),
        el('p', { class: 'cl-section-intro' }, 'Goal: the lowest average reflectance from 400 to 700 nm on glass, using up to 8 layers of MgF₂, SiO₂, Al₂O₃ and TiO₂.'),
        labRoot));
    root.hidden = false;
    window.GridCoatingLab?.open(labRoot);
    active = root;
  }
  function close() {
    if (!active) return;
    window.GridCoatingLab?.close();
    active.hidden = true;
    active.replaceChildren();
    active = null;
  }
  window.GridLab = Object.freeze({ open, close });
})();
