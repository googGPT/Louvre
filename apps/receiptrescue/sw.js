/* ReceiptRescue offline app-shell only; ticket photos remain in local IndexedDB. */
'use strict';
const CACHE = 'receiptrescue-shell-1-1-20261025';
const SHELL = ['./', './index.html', './index.htm', './style.css', './core.js', './app.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('receiptrescue-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && (request.mode === 'navigate' || SHELL.some(p => new URL(p,self.registration.scope).href === url.href))) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await cache.match(request)) || (request.mode === 'navigate' && await cache.match('./index.html')) || Response.error();
    }
  })());
});