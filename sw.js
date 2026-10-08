const CACHE = "reles-ayn-v194-sos-user-choice";
const ASSETS = [
  "/community.js?v=20261008-labels190",
  "/community.css?v=20261008-audience189",
  "/community-indicators.js?v=20261008-audience189",
  "/information.js?v=20261008-sos194",
  "/sos-siren.js?v=20261008-sos194",
  "/information.css?v=20261008-cards191",
  "/ain-streaming-provider.js?v=20261006-voice116",
  "/",
  "/index.html",
  "/administracion.html",
  "/administracion.webmanifest",
  "/pwa-register.js?v=20261007-pwa132",
  "/matrix.html",
  "/matrix.css?v=20261008-cascade184",
  "/matrix.js?v=20261008-cascade184",
  "/matrix-nav.js?v=20261008-nav161",
  "/ayn-navigation.js?v=20261008-nav161",
  "/ain-audio-worklet.js?v=20261004-release111",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/manifest.webmanifest",
  "/styles.css?v=20261008-adminroutes185",
  "/booking.css?v=20261006-orbit123",
  "/panic.css?v=20261006-orbit123",
  "/reports.css?v=20261006-orbit123",
  "/ui-feedback.css?v=20261006-orbit123",
  "/ayn-call-priority.js?v=20261008-voice181",
  "/ain-local-voice.js?v=20261008-voice181",
  "/ain-voice-phrases.js?v=20261006-voice116",
  "/app.js?v=20261008-sos194",
  "/panic.js?v=20261008-sos194",
  "/reports.js?v=20261008-labels190",
  "/ui-feedback.js?v=20261004-release111",
  "/administracion.css?v=20261008-mic182",
  "/administracion.js?v=20261008-sos193",
  "/master-admin-manager.css?v=20261008-community184",
  "/master-admin-manager.js?v=20261008-community184",
  "/relay-installer.js?v=20261008-compact160",
  "/actuator-voice.js?v=20261008-access165",
  "/administracion-voice.js?v=20261008-voice181"
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

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data;try{data=event.data.json();}catch{return;}
    if(data.type==='information'){
      const urgent=Boolean(data.emergency);
      await self.registration.showNotification(data.title||'Información · A&N Control',{
        body:data.body||'Tienes información nueva.',
        icon:'/app-icon-192.png',badge:'/app-icon-192.png',
        tag:'ayn-information-'+data.id,renotify:true,silent:false,
        vibrate:urgent?[300,150,300,150,500]:[160,80,160],
        requireInteraction:urgent,data:{url:data.url|| (urgent?'/#emergency':'/#information')}
      });
      return;
    }
    const tag='ayn-sos-'+data.id;
    if(data.cancelled){for(const n of await self.registration.getNotifications({tag}))n.close();}
    else if(Date.parse(data.expiresAt)<=Date.now())return;
    await self.registration.showNotification(data.title,{
      body:data.body,icon:'/app-icon-192.png',badge:'/app-icon-192.png',
      tag,renotify:true,silent:false,vibrate:data.cancelled?[]:[180,100,180,100,180,250,450,120,450,120,450,250,180,100,180,100,180],
      requireInteraction:!data.cancelled,data:{url:'/#emergency',expiresAt:data.expiresAt}
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  const url=event.notification.data?.url||'/';
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(c=>new URL(c.url).origin===self.location.origin);
    if(client){await client.focus();client.postMessage({type:'AYN_OPEN_INFORMATION',section:url.includes('#emergency')?'emergency':'wall'});}
    else await self.clients.openWindow(url);
  })());
});
