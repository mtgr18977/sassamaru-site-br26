/* eslint-disable no-restricted-globals */
'use strict';

const CACHE_VERSION = 'v3';
const CACHE_NAME = `br26-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  './index.html',
  './apps/index.html',
  './apps/bench-selecoes.html',
  './simulacoes/bench-copa2026.html',
  './simulacoes/bench-brasileirao2026.html',
  './modelos/model.js',
  './modelos/selecoes-model.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

// CDN assets to cache on first use (stale-while-revalidate)
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// Documentos e código da aplicação usam network-first; o resto (ícones,
// imagens, fontes locais) segue cache-first.
//
// Por que não cache-first para tudo: as páginas e modelos/model.js precisam
// estar na MESMA versão. Com cache-first, uma alteração em model.js sem bump
// manual do CACHE_VERSION deixava o JS preso na versão antiga enquanto o HTML
// vinha novo da rede — a página chamava uma função que a cópia em cache não
// tinha ("computeSeasonState is not a function"). Manter o código em
// network-first faz a consistência não depender de ninguém lembrar do bump.
const NETWORK_FIRST_RE = /\.(?:html|js|json)$/i;

function isAppCode(url, request) {
  return request.mode === 'navigate'
    || url.pathname.endsWith('/')
    || NETWORK_FIRST_RE.test(url.pathname);
}

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // Activate immediately, don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('br26-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // CDN resources: stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Same-origin: código e documentos em network-first (consistência de
  // versão), demais assets em cache-first (velocidade).
  if (url.origin === self.location.origin) {
    if (isAppCode(url, event.request)) {
      event.respondWith(networkFirst(event.request));
    } else {
      event.respondWith(cacheFirst(event.request));
    }
    return;
  }
});

// ── Strategies ───────────────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

// Network-first: busca na rede e atualiza o cache; cai para o cache só quando
// a rede falha (offline). Garante que HTML e JS nunca fiquem em versões
// diferentes enquanto houver conexão.
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Offline — BR26</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;' +
    'height:100vh;margin:0;background:#F7F6F2;color:#1A4731}' +
    '.box{text-align:center;padding:2rem}h1{font-size:2rem;margin-bottom:.5rem}p{color:#555}</style>' +
    '</head><body><div class="box"><h1>⚽ BR26</h1>' +
    '<p>Você está offline. Abra o app novamente quando tiver conexão.</p></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // If we have a cached response, return it immediately (stale),
  // while the network fetch continues in the background.
  if (cached) {
    return cached;
  }

  // No cached response: wait for network, and fall back to Response.error()
  // if the network request fails and resolves to null.
  const networkResponse = await networkFetch;
  return networkResponse || Response.error();
}
