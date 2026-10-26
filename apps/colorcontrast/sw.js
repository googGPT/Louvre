const VERSION='wave2-colorcontrast-v2';
const ASSETS=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('wave2-colorcontrast-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const scope=self.registration.scope;if(!req.url.startsWith(scope))return;event.respondWith(fetch(req).catch(()=>caches.match(req).then(r=>r|| (req.mode==='navigate'?caches.match('./index.html'):Response.error()))));});
