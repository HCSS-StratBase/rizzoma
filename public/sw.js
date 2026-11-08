/**
 * Rizzoma Service Worker
 *
 * Caching strategy:
 * - Static assets (JS, CSS, images): Cache-first with network fallback
 * - Authenticated API, Socket.IO, and uploaded content: Network-only
 * - Navigation: Network-first
 */

// v2 is a privacy boundary: activating it removes the former v1 dynamic cache,
// which could contain authenticated API responses keyed only by URL.
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `rizzoma-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `rizzoma-dynamic-${CACHE_VERSION}`;

// Assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Asset file extensions to cache
const STATIC_EXTENSIONS = [
  '.js',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.ico',
  '.webp',
];

// Authenticated transports must never be written to or served from CacheStorage.
const PRIVATE_NETWORK_PATHS = ['/api/', '/socket.io/', '/uploads/'];

/**
 * Check if a request is for a static asset
 */
function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

/**
 * Check if a request is for an API endpoint
 */
function isPrivateNetworkRequest(url) {
  return PRIVATE_NETWORK_PATHS.some((path) => url.pathname.startsWith(path));
}

/**
 * Install event - precache essential assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching assets...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precaching complete');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precaching failed:', error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete caches that don't match current version
              return (
                name.startsWith('rizzoma-') &&
                name !== STATIC_CACHE &&
                name !== DYNAMIC_CACHE
              );
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients...');
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - handle requests with appropriate strategy
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip WebSocket upgrade requests
  if (event.request.headers.get('Upgrade') === 'websocket') {
    return;
  }

  // Authenticated transport: network-only. A cache fallback here can expose the
  // previous account's private response after logout or an account switch.
  if (isPrivateNetworkRequest(url)) {
    event.respondWith(networkOnly(event.request));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Navigation requests: Network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(event.request));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirst(event.request, DYNAMIC_CACHE));
});

/**
 * Network-only strategy for authenticated transports.
 * Never consult or update CacheStorage, including when the request fails.
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network-only request failed:', error);
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}

/**
 * Cache-first strategy
 * Try cache, fall back to network, update cache
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Return cached response but update in background
    fetchAndCache(request, cache);
    return cached;
  }

  // Not in cache, fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first strategy
 * Try network, fall back to cache
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    console.error('[SW] Network-first failed, no cache:', error);
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Network-first with offline fallback for navigation
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Try to return cached page
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Try to return cached index.html as fallback
    const indexCached = await caches.match('/');
    if (indexCached) {
      return indexCached;
    }

    // Last resort: offline page
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rizzoma - Offline</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #333;
    }
    .offline-container {
      text-align: center;
      padding: 40px;
    }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    button {
      background: #2c3e50;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
    }
    button:hover { background: #34495e; }
  </style>
</head>
<body>
  <div class="offline-container">
    <h1>You're offline</h1>
    <p>Check your internet connection and try again.</p>
    <button onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

/**
 * Fetch and cache in background (stale-while-revalidate)
 */
async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
  } catch (error) {
    // Silent fail for background update
  }
}

/**
 * Handle messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(
          names.map((name) => {
            if (name.startsWith('rizzoma-')) {
              return caches.delete(name);
            }
          })
        );
      })
    );
  }
});

/**
 * Background sync for offline mutations (if supported)
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'rizzoma-sync') {
    event.waitUntil(syncOfflineMutations());
  }
});

async function syncOfflineMutations() {
  // This would sync any queued offline mutations
  // Implementation depends on offline queue in client
  console.log('[SW] Background sync triggered');
}

/**
 * Push notification handling (for future use)
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || 'New activity in Rizzoma',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'rizzoma-notification',
    data: data.url || '/',
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Rizzoma', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || '/');
      }
    })
  );
});
