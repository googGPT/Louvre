/* DecisionDeck v2 app-shell cache, isolated to this app's scope. */
const CACHE='louvre-decisiondeck-shell-v2';
const ASSETS=['./','./index.html','./index.htm','./style.css','./core.js','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('louvre-decisiondeck-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(!response.ok)throw Error('Network response not OK');
  return response;
 }).catch(()=>new Response('Hors ligne : ressource indisponible',{status:503}))));
});