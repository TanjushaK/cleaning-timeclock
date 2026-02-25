/* Cleaning Timeclock — PWA Service Worker (safe v1)
   Goals:
   - Offline launch (fallback to /offline)
   - Safe updates (SKIP_WAITING + cache versioning)
   - Emergency kill-switch via /api/pwa/sw-kill (PWA_SW_ENABLED=0)
*/

const CACHE_VERSION = "ct-pwa-v1";
const STATIC_CACHE = `ct-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ct-runtime-${CACHE_VERSION}`;

const CORE = [
  "/offline",
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
];

const KILL_ENDPOINT = "/api/pwa/sw-kill";
const KILL_CHECK_EVERY_MS = 5 * 60 * 1000;

let lastKillCheck = 0;
let killDisabled = false;

async function bestEffortPrecache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    CORE.map(async (u) => {
      try {
        await cache.add(u);
      } catch {
        // ignore
      }
    })
  );
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => (k === STATIC_CACHE || k === RUNTIME_CACHE ? null : caches.delete(k))));
}

async function notifyClients(msg) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage(msg);
  } catch {
    // ignore
  }
}

async function disableSelf() {
  killDisabled = true;
  try {
    await cleanupOldCaches();
  } catch {
    // ignore
  }
  try {
    await self.registration.unregister();
  } catch {
    // ignore
  }
  await notifyClients({ type: "SW_DISABLED" });
}

async function checkKillSwitch(force) {
  if (killDisabled) return false;

  const now = Date.now();
  if (!force && now - lastKillCheck < KILL_CHECK_EVERY_MS) return true;
  lastKillCheck = now;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);

    const res = await fetch(KILL_ENDPOINT, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return true;

    const data = await res.json().catch(() => null);
    if (data && data.enabled === false) {
      await disableSelf();
      return false;
    }
  } catch {
    // ignore (offline, timeout)
  }

  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await bestEffortPrecache();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const ok = await checkKillSwitch(true);
      if (!ok) return;
      await cleanupOldCaches();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data) return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "CHECK_KILL") {
    event.waitUntil(checkKillSwitch(true));
  }
});

function isStaticAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.endsWith(".js")) return true;
  if (pathname.endsWith(".css")) return true;
  if (pathname.endsWith(".png")) return true;
  if (pathname.endsWith(".jpg")) return true;
  if (pathname.endsWith(".jpeg")) return true;
  if (pathname.endsWith(".webp")) return true;
  if (pathname.endsWith(".svg")) return true;
  if (pathname.endsWith(".ico")) return true;
  if (pathname.endsWith(".woff2")) return true;
  if (pathname.endsWith(".woff")) return true;
  if (pathname.endsWith(".ttf")) return true;
  if (pathname.endsWith(".eot")) return true;
  return false;
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  if (res && res.status === 200) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirstNavigate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const root = await cache.match("/");
    if (root) return root;
    const fallback = await caches.match("/offline");
    if (fallback) return fallback;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Never touch API routes
  if (url.pathname.startsWith("/api/")) return;

  // Avoid caching Next image optimizer
  if (url.pathname.startsWith("/_next/image")) return;

  // Opportunistic kill-check in background (no blocking)
  event.waitUntil(checkKillSwitch(false));

  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigate(req));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});
