/* CitationCraft offline shell; never cache records, localStorage or user files. */
const CACHE='louvre-citationcraft-v1';
const ASSETS=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('louvre-citationcraft-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
 event.respondWith(fetch(request).catch(()=>caches.match(request).then(r=>r||(request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
