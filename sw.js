/* Offline support: cache-first for the game files, network-first fallback for everything else. */
const CACHE = 'gdweb-v3';
const FILES = [
  './', 'index.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest',
  'js/util.js', 'js/objects.js', 'js/levelfmt.js', 'js/engine.js', 'js/levels.js',
  'js/levels/clockwork.js', 'js/levels/nightmare.js', 'js/levels/overload.js', 'js/levels/horizon.js', 'js/icons.js',
  'js/render.js', 'js/audio.js', 'js/game.js', 'js/editor.js', 'js/ui.js', 'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
