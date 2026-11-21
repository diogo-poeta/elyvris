'use strict';
// Public Supabase URL and publishable key. NEVER put the secret or service_role key here.
// On localhost the page uses the local mock server; add ?backend=live to use the real project.
(() => {
  const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const mock = local && new URLSearchParams(location.search).get('backend') !== 'live';
  window.GRID_CONFIG = Object.freeze({
    url: mock ? 'http://127.0.0.1:8774' : 'https://soyrjjixmdwwtffqpccn.supabase.co',
    key: mock ? 'mock-publishable-key' : 'sb_publishable_LmDvnkmG_ZCTJHaCIDE50A_DVPgO7FS',
    userDomain: 'grid.elyvris.invalid',
    bucket: 'grid-files',
    idleMinutes: 30,          // lock automatically after this long without activity
    maxFileMB: 50
  });
})();
