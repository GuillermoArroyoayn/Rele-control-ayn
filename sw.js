const CACHE = "reles-ayn-v200-safari-navigation-recovery";
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
  "/temporary-permissions.css?v=20261009-tmp01",
  "/temporary-permissions.js?v=20261009-tmp01",
  "/booking.css?v=20261006-orbit123",
  "/panic.css?v=20261006-orbit123",
  "/reports.css?v=20261006-orbit123",
  "/ui-feedback.css?v=20261006-orbit123",
  "/ayn-call-priority.js?v=20261008-voice181",
  "/ain-local-voice.js?v=20261008-voice181",
  "/ain-voice-phrases.js?v=20261006-voice116",
  "/app.js?v=20261009-alias199",
  "/panic.js?v=20261008-sos194",
  "/reports.js?v=20261008-labels190",
  "/ui-feedback.js?v=20261004-release111",
  "/administracion.css?v=20261009-relay198",
  "/administracion.js?v=20261009-relay198",
  "/master-admin-manager.css?v=20261008-community184",
  "/master-admin-manager.js?v=20261008-community184",
  "/relay-installer.js?v=20261008-compact160",
  "/actuator-voice.js?v=20261009-alias199",
  "/administracion-voice.js?v=20261009-alias199"
];
// Una imagen o archivo opcional que falle no debe bloquear la actualización en iOS.
self.addEventListener("install", (event) =>
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(ASSETS.map(asset => cache.add(asset)));
    } catch (error) {
      // Safari podrá navegar online aunque el almacenamiento de caché no esté disponible.
    }
    await self.skipWaiting();
  })()),
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
// Nunca devolver undefined a respondWith: Safari muestra una pantalla blanca
// con "Returned response is null" cuando una página invitada no está en caché.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Autorización e invitaciones nunca se almacenan en este service worker.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isNavigation = request.mode === "navigate" || request.destination === "document";
  const refresh = isNavigation || /\.(?:js|css|html)$/.test(url.pathname);
  event.respondWith((async () => {
    try {
      const network = await fetch(request, refresh ? {cache:"no-store"} : undefined);
      if (network instanceof Response) return network;
    } catch (error) {
      // Solo en errores de red: intentar una versión offline.
    }
    try {
      const cache = await caches.open(CACHE);
      const exact = await cache.match(request);
      if (exact instanceof Response) return exact;
      if (isNavigation) {
        const shell = url.pathname.startsWith("/administracion") ?
          "/administracion.html" : "/index.html";
        const fallback = await cache.match(shell) || await caches.match(shell);
        if (fallback instanceof Response) return fallback;
      }
    } catch (error) {
      // Almacenamiento no disponible: se entregará una respuesta HTTP válida.
    }
    if (isNavigation) {
      return new Response(
        '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font:16px system-ui;padding:28px"><h1>A&N Control</h1><p>Sin conexión con el servidor. Comprueba Internet y vuelve a intentar. Tu invitación no se ha eliminado.</p><button onclick="location.reload()" style="padding:12px 18px">Reintentar</button></body></html>',
        {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}}
      );
    }
    return new Response("Recurso temporalmente no disponible.",{
      status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}
    });
  })());
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
