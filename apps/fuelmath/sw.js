/* FuelMath offline PWA — online-first for freshness, cached fallback when disconnected. */
const CACHE='louvre-fuelmath-shell-v2';
const ASSETS=['./','./index.html','./index.htm','./style.css','./core.js','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
   keys.filter(key=>key.startsWith('louvre-fuelmath-')&&key!==CACHE).map(key=>caches.delete(key))
 )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith(
   fetch(event.request).then(response=>{
     if(response.ok){
       const copy=response.clone();
       event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
     }
     return response;
   }).catch(async()=>{
     const existing=await caches.match(event.request);
     if(existing)return existing;
     if(event.request.mode==='navigate'){
       const entry=await caches.match('./index.html');
       if(entry)return entry;
     }
     return new Response('Ressource non disponible hors ligne',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
   })
 );
});