/* RoomSketch offline static shell only; no room plans or user backups cached. */
const CACHE='louvre-roomsketch-v1';
const FILES=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('louvre-roomsketch-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||!req.url.startsWith(self.registration.scope))return;
 e.respondWith(fetch(req).catch(()=>caches.match(req).then(res=>res||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
