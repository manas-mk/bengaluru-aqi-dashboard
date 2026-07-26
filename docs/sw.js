// App-shell cache only — no build step means this version string is bumped by hand
// alongside the ?v= on style.css/app.js in index.html whenever either changes.
const CACHE_NAME = "bwi-shell-20260727d";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=20260727d",
  "./app.js?v=20260727d",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only same-origin GET requests are managed here. Every third-party fetch — the
// Open-Meteo APIs, Leaflet CDN, RainViewer/CARTO map tiles, Google Fonts — passes
// straight through untouched; this project already handles data freshness itself
// via the localStorage stale-while-revalidate cache in app.js.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp.clone()));
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
