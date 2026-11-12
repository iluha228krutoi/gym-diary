// Service worker: сохраняет файлы приложения на телефоне, чтобы оно работало без интернета.
//
// При каждом обновлении приложения меняй CACHE_VERSION (и APP_VERSION в js/version.js):
// телефон скачает новые файлы, а пользователь увидит «Доступна новая версия».

const CACHE_VERSION = 'v0.4.1';
const CACHE = `gymapp-${CACHE_VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/ui.js',
  './js/data.js',
  './js/db.js',
  './js/backup.js',
  './js/version.js',
  './js/core/util.js',
  './js/core/plans.js',
  './js/core/workouts.js',
  './js/core/records.js',
  './js/core/progress.js',
  './js/chart.js',
  './js/sections/progress.js',
  './js/sections/records.js',
  './js/sections/workout.js',
  './js/sections/plan.js',
  './js/sections/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('gymapp-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Сначала кэш, потом сеть: приложение открывается мгновенно и без интернета
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
