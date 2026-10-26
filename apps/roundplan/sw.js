/* RoundPlan PWA: isolate the scope, no external data or fetches. */
const CACHE='louvre-roundplan-shell-v2';
const ASSETS=['./','./index.html','./index.htm','./style.css','./core.js','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('louvre-roundplan-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,p=new URL(r.url),scope=new URL(self.registration.scope);if(r.method!=='GET'||p.origin!==scope.origin||!p.pathname.startsWith(scope.pathname))return;e.respondWith(caches.match(r).then(c=>c||fetch(r).then(resp=>resp.ok?resp:Response.error()).catch(()=>new Response('RoundPlan hors ligne',{status:503}))));});