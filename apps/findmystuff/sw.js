/* FindMyStuff PWA shell: only caches this app's own public static files. */
const CACHE='findmystuff-shell-v1';
const FILES=['./','./index.html','./style.css','./core.js','./app.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('findmystuff-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;const url=new URL(req.url);const scope=new URL(self.registration.scope);
  if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}return resp;}).catch(()=>caches.match(req).then(cached=>cached||caches.match('./index.html'))));
});