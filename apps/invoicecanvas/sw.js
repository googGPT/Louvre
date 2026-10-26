/* InvoiceCanvas static PWA shell; never caches invoices or downloaded records. */
const CACHE='louvre-invoicecanvas-v1';
const ASSETS=['./','./index.html','./index.htm','./core.js','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('louvre-invoicecanvas-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET'||!q.url.startsWith(self.registration.scope))return;
 e.respondWith(fetch(q).catch(()=>caches.match(q).then(r=>r||(q.mode==='navigate'?caches.match('./index.html'):Response.error()))));});
