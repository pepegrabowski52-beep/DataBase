// Fundus Service Worker: macht Website und App offline-fähig und hält sie automatisch aktuell.
// Eigene Dateien kommen immer zuerst aus dem Netz (neueste Version), offline aus dem Cache.
// Bei jeder Veröffentlichung VERSION erhöhen, dann räumt der neue Worker alte Caches weg.
const VERSION = '2026-10-08.2';
const CACHE = 'fundus-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'app.json',
  'js/art.js',
  'js/db.js',
  'js/app.js',
  'js/fx.js',
  'js/auth.js',
  'js/checkout.js',
  'js/admin.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (key, res) => caches.open(CACHE).then((c) => c.put(key, res));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Eigene Dateien: zuerst Netz, offline aus dem Cache
  if (url.origin === self.location.origin) {
    // Die APK nie zwischenspeichern
    if (url.pathname.endsWith('.apk')) return;
    const key = req.mode === 'navigate' ? 'index.html' : req;
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) put(key, res.clone());
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  // Schriften von Google: aus dem Cache, im Hintergrund aktualisieren
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
