(() => {
  'use strict';
  const dialog = document.getElementById('workflow-document');
  const open = document.querySelector('.workflow-open');
  const close = dialog.querySelector('.document-close');
  open.addEventListener('click', () => { dialog.showModal(); close.focus(); });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
})();
