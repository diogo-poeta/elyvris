const CACHE = 'elyvris-studio-v2';
const PAGE = 'studio.html';
// Files the page loads later, which are not written in studio.html itself.
const EXTRA = ['materials-data.json', 'favicon.svg', 'studio.webmanifest', 'assets/brand/elyvris-mark.svg', 'assets/app/icon-192.png', 'assets/app/icon-512.png'];
const KEPT = /\.(?:html|js|css|json|svg|png|webmanifest)$/;

/* The address of a file without its "?v=7" part: one copy per file, whatever its version. */
const plain = url => { const u = new URL(url, self.registration.scope); u.search = ''; u.hash = ''; return u.href; };

async function keep(cache, url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(url + ': ' + response.status);
  await cache.put(plain(url), response);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const html = await (await fetch(PAGE, { cache: 'reload' })).text();
    // Every local stylesheet, script and image named in the page.
    const named = Array.from(html.matchAll(/(?:href|src)="([^"#:]+\.(?:css|js|svg|png|json)(?:\?[^"]*)?)"/g), match => match[1]);
    await Promise.all([PAGE, ...new Set(named), ...EXTRA].map(url => keep(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('elyvris-studio-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !KEPT.test(url.pathname)) return;
  if (request.mode === 'navigate' && !url.pathname.endsWith('/' + PAGE)) return;        // other pages are left to the browser
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), key = plain(request.url);
    try {
      const response = await fetch(request);
      if (response.ok && await cache.match(key)) await cache.put(key, response.clone());   // refresh only what the Studio keeps
      return response;
    } catch (error) {
      const copy = await cache.match(key);
      if (copy) return copy;
      throw error;
    }
  })());
});
