// Сервис-воркер Hub: всегда берём свежую версию из сети,
// а копию держим на случай, если связи нет (метро, самолёт).
// Данные Supabase не трогаем: они идут мимо воркера.
const CACHE = 'hub-shell-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/theme.js', '/config.js', '/icons-data.js', '/brand/hub/hub-u.svg', '/brand/hub/hub-favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
