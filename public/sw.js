/**
 * Saral service worker.
 *
 * Minimal install-only SW — exists primarily so Chrome / Edge / Samsung
 * Internet show the "Install app" prompt. We also pre-cache the shell
 * so first paint stays snappy.
 *
 * Real offline behavior (queue / Rx) can be layered on later — for now
 * a no-op fetch handler is enough to qualify as installable.
 */

const CACHE_VERSION = "saral-v2";
const SHELL = ["/", "/staff/queue"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigation, cache-fallback only when offline.
// Pass-through everything else.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((r) => r || caches.match("/")),
      ),
    );
  }
});
