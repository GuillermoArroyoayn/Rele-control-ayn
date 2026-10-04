const CACHE = "reles-ayn-v95";
const ASSETS = [
  "/ain-streaming-provider.js?v=20261004-release95",
  "/",
  "/index.html",
  "/administracion.html",
  "/ain-audio-worklet.js?v=20261004-release95",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/manifest.webmanifest",
  "/styles.css?v=20261004-release95",
  "/share.css",
  "/booking.css?v=20261004-release95",
  "/panic.css?v=20261004-release95",
  "/reports.css?v=20261004-release95",
  "/ui-feedback.css?v=20261004-release95",
  "/ain-local-voice.js?v=20261004-release95",
  "/ain-voice-phrases.js?v=20261004-release95",
  "/app.js?v=20261004-release95",
  "/panic.js?v=20261004-release95",
  "/reports.js?v=20261004-release95",
  "/ui-feedback.js?v=20261004-release95",
  "/administracion.css?v=20261004-release95",
  "/administracion.js?v=20261004-release95"
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
          keys.filter((k) => k.startsWith("reles-ayn-") && k !== CACHE).map((k) => caches.delete(k)),
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
  const url=new URL(e.request.url);
  const refresh=url.origin===self.location.origin&&(e.request.mode==='navigate'||/\.(js|css)$/.test(url.pathname));
  e.respondWith(fetch(e.request,refresh?{cache:'no-store'}:undefined).catch(() => caches.open(CACHE).then(cache=>cache.match(e.request))));
});
