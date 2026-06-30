const CACHE_NAME = '360stock-v12';
const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/manifest.json',
    '/new_virtu_logo_colored.png',
    'https://unpkg.com/@phosphor-icons/web'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Para requisições da API, tentar rede sempre (network only)
    if (e.request.url.includes('/api/')) {
        return; 
    }

    // Cache-first (offline) para arquivos estáticos e HTML
    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            return cachedResponse || fetch(e.request).catch(() => {
                // Se falhar offline, a página base responde
                if (e.request.destination === 'document') {
                    return caches.match('/');
                }
            });
        })
    );
});