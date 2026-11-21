// VERSE — fonctionne hors ligne une fois installée
const CACHE = 'verse-v1';
const SHELL = ['./', 'index.html', 'player.css', 'player.js', 'app.js', 'theme.js', 'style.css', 'fonts.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/anton-ext.woff2', 'fonts/anton.woff2', 'fonts/archivo-ext.woff2', 'fonts/archivo.woff2', 'fonts/bebas-neue-normal.woff2', 'fonts/bungee-normal.woff2', 'fonts/dm-serif-display-italic.woff2', 'fonts/dm-serif-display-normal.woff2', 'fonts/inter.woff2', 'fonts/monoton-normal.woff2', 'fonts/permanent-marker-normal.woff2', 'fonts/playfair-display-italic.woff2', 'fonts/playfair-display-normal.woff2', 'fonts/rubik-mono-one-normal.woff2', 'fonts/space-grotesk-normal.woff2', 'fonts/syne-normal.woff2', 'fonts/unbounded-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // les paroles (lrclib.net) ne passent jamais par le cache
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
