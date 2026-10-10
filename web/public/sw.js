const CACHE = 'hos-sandbox-' + (self.__BUILD__ || 'dev');
const ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './fonts/atkinson-next-400.woff2', './fonts/atkinson-next-600.woff2', './fonts/atkinson-next-700.woff2', './fonts/atkinson-next-800.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// network-first, fall back to cache (so fixes ship instantly but the app still opens offline in the truck)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
// A driving-alert notification (alerts.ts): tapping it brings the app back to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow('./'))));
});
