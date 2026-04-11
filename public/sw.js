/* Cleaning Timeclock Service Worker (safe, update-friendly)
   - Navigations: network-first with /offline fallback
   - Static assets: cache-first
   - Other same-origin GET: stale-while-revalidate
   - Never cache /api/*
   - Supports kill/clear via client unregister + cache delete (ct-*)
*/
const SW_VERSION = "ct-sw-v5";
const STATIC_CACHE = `ct-static-${SW_VERSION}`;
const RUNTIME_CACHE = `ct-runtime-${SW_VERSION}`;

const CORE = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/tanija-logo.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
];

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".ttf")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k === STATIC_CACHE || k === RUNTIME_CACHE) return null;
          if (k.startsWith("ct-")) return caches.delete(k);
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("ct-")).map((k) => caches.delete(k)));
      })()
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin GET
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Never cache SW itself
  if (url.pathname === "/sw.js") return;

  // Never cache API routes
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fallback to offline page
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match("/offline");
          return offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const res = await fetch(req);
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        } catch {
          return cached;
        }
      })()
    );
    return;
  }

  // Other requests: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })()
  );
});
