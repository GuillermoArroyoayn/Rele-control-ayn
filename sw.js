const CACHE = "reles-ayn-v105";
const ASSETS = [
  "/ain-streaming-provider.js?v=20261004-release105",
  "/",
  "/index.html",
  "/administracion.html",
  "/ain-audio-worklet.js?v=20261004-release105",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/manifest.webmanifest",
  "/styles.css?v=20261004-release105",
  "/share.css",
  "/booking.css?v=20261004-release105",
  "/panic.css?v=20261004-release105",
  "/reports.css?v=20261004-release105",
  "/ui-feedback.css?v=20261004-release105",
  "/ain-local-voice.js?v=20261004-release105",
  "/ain-voice-phrases.js?v=20261004-release105",
  "/app.js?v=20261004-release105",
  "/panic.js?v=20261004-release105",
  "/reports.js?v=20261004-release105",
  "/ui-feedback.js?v=20261004-release105",
  "/administracion.css?v=20261004-release105",
  "/administracion.js?v=20261004-release105"
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

self.addEventListener('push',event=>{event.waitUntil((async()=>{let data;try{data=event.data.json();}catch{return;}const tag='ayn-sos-'+data.id;if(data.cancelled){for(const notification of await self.registration.getNotifications({tag}))notification.close();}else if(Date.parse(data.expiresAt)<=Date.now())return;await self.registration.showNotification(data.title,{body:data.body,icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag,renotify:true,silent:false,vibrate:data.cancelled?[]:[250,100,250,100,500],requireInteraction:!data.cancelled,data:{url:'/',expiresAt:data.expiresAt}});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>new URL(c.url).origin===self.location.origin);if(client)await client.focus();else await self.clients.openWindow('/');})());});
