const CACHE = 'clock14-' + (self.__BUILD__ || 'dev');
const ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './splash-1080x1920.webp', './splash-1179x2556.webp',
  './fonts/atkinson-next-400.woff2', './fonts/atkinson-next-600.woff2', './fonts/atkinson-next-700.woff2', './fonts/atkinson-next-800.woff2',
  './fonts/atkinson-mono-500.woff2', './fonts/atkinson-mono-700.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// network-first, fall back to cache (so fixes ship instantly but the app still opens offline in the truck)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && sameOrigin) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch((err) => caches.match(e.request).then((r) => {
        if (r) return r;
        if (e.request.mode === 'navigate') return caches.match('./index.html').then((idx) => idx || Promise.reject(err));
        return Promise.reject(err);
      }))
  );
});
// A driving-alert notification (alerts.ts): tapping it brings the app back to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow('./'))));
});
