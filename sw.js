const CACHE="reles-ayn-v2";
const ASSETS=["/","/index.html","/styles.css","/app.js","/app-icon-192.png","/app-icon-512.png","/manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  if(new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
