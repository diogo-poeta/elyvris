/* A movable notebook, kept alive while closed so edits and tools retain their state. */
(() => {
  'use strict';
  const panel = document.getElementById('studio-notes');
  const opener = document.getElementById('notes-open');
  const handle = document.getElementById('notes-handle');
  const frame = document.getElementById('notes-frame');
  let position = null, drag = null;

  function place(x, y) {
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    position = { x: Math.max(margin, Math.min(x, maxX)), y: Math.max(margin, Math.min(y, maxY)) };
    panel.style.left = position.x + 'px';
    panel.style.top = position.y + 'px';
  }
  function open() {
    panel.hidden = false;
    if (!frame.hasAttribute('src')) frame.src = 'notes.html?embedded=1';
    opener.setAttribute('aria-expanded', 'true');
    place(position ? position.x : window.innerWidth - panel.offsetWidth - 24,
          position ? position.y : Math.min(100, window.innerHeight - panel.offsetHeight - 16));
    handle.focus({ preventScroll: true });
  }
  function close() {
    frame.contentWindow?.postMessage({ type: 'elyvris-notes-save' }, location.origin);
    panel.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    opener.focus({ preventScroll: true });
  }
  opener.addEventListener('click', () => panel.hidden ? open() : close());
  document.getElementById('notes-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'elyvris-notes-close') close();
  });
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { id: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y };
    handle.setPointerCapture(event.pointerId);
    panel.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', event => {
    if (drag && drag.id === event.pointerId) place(event.clientX - drag.dx, event.clientY - drag.dy);
  });
  const stop = () => { drag = null; panel.classList.remove('is-dragging'); };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('lostpointercapture', stop);
  handle.addEventListener('keydown', event => {
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!steps[event.key]) return;
    event.preventDefault();
    const [dx, dy] = steps[event.key], step = event.shiftKey ? 40 : 10;
    place(position.x + dx * step, position.y + dy * step);
  });
  window.addEventListener('resize', () => { if (!panel.hidden && position) place(position.x, position.y); });
  if (location.hash === '#notes') open();
})();
