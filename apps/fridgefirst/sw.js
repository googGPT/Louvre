'use strict';
const CACHE='fridgefirst-shell-v1';
const ASSETS=['./','./index.html','./index.htm','./style.css','./core.js','./app.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fridgefirst-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET'||!req.url.startsWith(self.registration.scope))return;e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(resp=>{if(resp.ok&&new URL(req.url).origin===self.location.origin){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}return resp;})));});