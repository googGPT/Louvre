/* CSVClinic v2: cache only app shell; imported/exported CSV is never cached. */
const KEY='wave2-csvclinic-v2';
const URLS=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(
  caches.open(KEY).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wave2-csvclinic-')&&k!==KEY).map(k=>caches.delete(k))))
   .then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||!req.url.startsWith(self.registration.scope))return;
 e.respondWith(fetch(req).catch(()=>caches.match(req).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
