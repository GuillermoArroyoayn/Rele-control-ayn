const CACHE="reles-ayn-v11";
const ASSETS=["/","/index.html","/styles.css?v=20260927-2152","/app.js?v=20260927-2240","/share.css","/app-icon-192.png","/app-icon-512.png","/manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("fetch",e=>{
  if(new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
