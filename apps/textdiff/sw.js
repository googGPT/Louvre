/* TextDiff offline shell: never cache user text, diff data or object URLs. */
const CACHE='louvre-textdiff-v1';
const STATIC=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('louvre-textdiff-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
  event.respondWith(fetch(request).catch(()=>caches.match(request).then(response=>response||(request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
