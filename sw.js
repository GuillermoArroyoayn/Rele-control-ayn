const CACHE = "reles-ayn-v84";
const ASSETS = [
  "/ui-feedback.js?v=20261004-timer84",
  "/ui-feedback.css?v=20261004-timer84",
  "/ain-voice-phrases.js?v=20261004-timer84",
  "/",
  "/reports.css?v=20261003-reports57",
  "/reports.js?v=20261003-reports57",
  "/panic.css?v=20261003-sos56",
  "/panic.js?v=20261004-timer84",
  "/administracion.html",
  "/administracion.js",
  "/administracion.css",
  "/index.html",
  "/styles.css?v=20261004-timer84",
  "/app.js?v=20261004-timer84",
  "/ain-local-voice.js?v=20261004-timer84",
  "/ain-audio-worklet.js?v=20261004-timer84",
  "/share.css",
  "/booking.css?v=20261004-timer84",
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
