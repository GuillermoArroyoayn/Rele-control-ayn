const CACHE = "reles-ayn-v49";
const ASSETS = [
  "/",
  "/panic.css",
  "/panic.js?v=20261003-panic48",
  "/administracion.html",
  "/administracion.js",
  "/administracion.css",
  "/index.html",
  "/styles.css?v=20260929-0857",
  "/app.js?v=20261003-voice49",
  "/ain-local-voice.js?v=20261003-voice49",
  "/ain-audio-worklet.js?v=20261003-voice49",
  "/share.css",
  "/booking.css?v=20260929-0001",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
