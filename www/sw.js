// Offline cache so the installed app works without a connection.
const CACHE = 'gwent-v13';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'icons/icon-192.png',
  'js/cards.js', 'js/engine.js', 'js/ai.js', 'js/ui.js', 'js/deckbuilder.js', 'js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates show up), falling back to the cache when offline.
// Card art, UI textures and sounds are cached the first time they are loaded.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // 'no-cache' makes the browser revalidate with the server instead of reusing a stale HTTP-cached copy
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
