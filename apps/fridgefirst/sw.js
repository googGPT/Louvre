'use strict';
// Généré par scripts/build_sw.py : ne pas modifier à la main (relancer le script).
// Le nom du cache contient une empreinte du contenu : toute modification de l'appli
// produit un nouveau nom, donc une mise à jour automatique chez les visiteurs.
const CACHE = "louvre-fridgefirst-b4e60bcb3e78";
const ASSETS = ["./", "./app.js", "./core.js", "./icon.svg", "./index.htm", "./index.html", "./louvre-i18n.css", "./louvre-i18n.js", "./manifest.webmanifest", "./messages.js", "./style.css"];
const OLD_PREFIXES = ["fridgefirst-shell-", "louvre-fridgefirst-"];

self.addEventListener('install', (event) => {
  // Première visite ou nouvelle version : on remplit le magasin hors ligne.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // On jette les anciennes versions de CETTE appli uniquement (jamais celles des autres applis).
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key !== CACHE && OLD_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // seules les lectures passent par le cache
  if (!request.url.startsWith(self.registration.scope)) return; // fichiers de cette appli seulement
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request); // version déjà en magasin ?
    const network = fetch(request).then((response) => {
      // Réponse fraîche et sûre : on remplace la version en magasin.
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => undefined)); // rafraîchit en arrière-plan
      return cached; // affichage immédiat, même hors ligne
    }
    try {
      return await network; // rien en magasin : on attend le réseau
    } catch (error) {
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html'); // page de secours hors ligne
        if (shell) return shell;
      }
      return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }));
});
