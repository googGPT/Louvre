#!/usr/bin/env python3
"""Génère le service worker (sw.js) de chaque appli Louvre à partir d'un modèle unique.

Métaphore : le service worker est le « magasin » hors ligne de l'appli. Son nom
(CACHE) porte une empreinte calculée sur le contenu des fichiers de l'appli :
dès qu'un fichier change, l'empreinte change, le navigateur détecte un nouveau
sw.js et remplace le magasin. Plus besoin de penser à « incrémenter v1 -> v2 ».

Stratégie commune : on affiche immédiatement la version en cache (rapide, marche
hors ligne), et on la rafraîchit en arrière-plan quand le réseau répond.

Usage : python scripts/build_sw.py          (régénère tous les sw.js)
        python scripts/build_sw.py --check  (échoue si un sw.js n'est pas à jour)
"""

import hashlib  # empreinte SHA-256 du contenu des fichiers
import json  # écriture de listes JavaScript valides
import pathlib  # parcours des dossiers
import re  # lecture des anciens noms de cache
import sys  # arguments et code de sortie

ROOT = pathlib.Path(__file__).resolve().parent.parent  # racine du dépôt
APPS = ROOT / "apps"  # dossier des applis
SKIP_DIRS = {"tests"}  # dossiers jamais servis
SKIP_FILES = {"sw.js", "sitemap.xml", "README.md", "LOUVRE-REVIEW.md"}  # fichiers non mis en cache

TEMPLATE = """'use strict';
// Généré par scripts/build_sw.py : ne pas modifier à la main (relancer le script).
// Le nom du cache contient une empreinte du contenu : toute modification de l'appli
// produit un nouveau nom, donc une mise à jour automatique chez les visiteurs.
const CACHE = {cache};
const ASSETS = {assets};
const OLD_PREFIXES = {old};

self.addEventListener('install', (event) => {{
  // Première visite ou nouvelle version : on remplit le magasin hors ligne.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', (event) => {{
  // On jette les anciennes versions de CETTE appli uniquement (jamais celles des autres applis).
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key !== CACHE && OLD_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
}});

self.addEventListener('fetch', (event) => {{
  const request = event.request;
  if (request.method !== 'GET') return; // seules les lectures passent par le cache
  if (!request.url.startsWith(self.registration.scope)) return; // fichiers de cette appli seulement
  event.respondWith(caches.open(CACHE).then(async (cache) => {{
    const cached = await cache.match(request); // version déjà en magasin ?
    const network = fetch(request).then((response) => {{
      // Réponse fraîche et sûre : on remplace la version en magasin.
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    }});
    if (cached) {{
      event.waitUntil(network.catch(() => undefined)); // rafraîchit en arrière-plan
      return cached; // affichage immédiat, même hors ligne
    }}
    try {{
      return await network; // rien en magasin : on attend le réseau
    }} catch (error) {{
      if (request.mode === 'navigate') {{
        const shell = await cache.match('./index.html'); // page de secours hors ligne
        if (shell) return shell;
      }}
      return new Response('Hors ligne', {{ status: 503, headers: {{ 'Content-Type': 'text/plain; charset=utf-8' }} }});
    }}
  }}));
}});
"""


def served_files(app):
    """Liste triée des fichiers servis par l'appli (chemins relatifs, ex. 'vendor/qrcode.js')."""
    files = []
    for path in sorted(app.rglob("*")):  # tous les fichiers, sous-dossiers compris
        rel = path.relative_to(app)
        if not path.is_file() or rel.parts[0] in SKIP_DIRS or rel.name in SKIP_FILES:
            continue  # ignore tests, docs et le service worker lui-même
        files.append(rel.as_posix())
    return files


def old_prefixes(app):
    """Préfixes des anciens caches de l'appli, pour les supprimer lors de la mise à jour."""
    slug = app.name
    prefixes = {f"louvre-{slug}-"}  # préfixe du nouveau modèle
    sw = app / "sw.js"
    if sw.is_file():
        text = sw.read_text(encoding="utf-8")
        prefixes.update(re.findall(r"startsWith\(\s*['\"]([^'\"]+)['\"]", text))  # anciens filtres
        prefixes.update(re.findall(r"PREFIX\s*=\s*['\"]([^'\"]+)['\"]", text))  # variante TravelDay
        prefixes.update(re.findall(r"OLD_PREFIXES\s*=\s*(\[[^\]]*\])", text) and
                        json.loads(re.findall(r"OLD_PREFIXES\s*=\s*(\[[^\]]*\])", text)[0]))
    # sécurité : un préfixe doit nommer l'appli, pour ne jamais effacer le cache d'une autre
    return sorted(p for p in prefixes if slug in p)


def render(app):
    """Construit le contenu de sw.js pour une appli."""
    files = served_files(app)
    digest = hashlib.sha256()  # empreinte du contenu servi
    for rel in files:
        digest.update(rel.encode())  # le nom compte (renommage = nouvelle version)
        digest.update((app / rel).read_bytes())  # et le contenu
    cache = f"louvre-{app.name}-{digest.hexdigest()[:12]}"
    assets = ["./"] + [f"./{rel}" for rel in files]  # './' = la page d'accueil de l'appli
    return TEMPLATE.format(
        cache=json.dumps(cache),
        assets=json.dumps(assets, ensure_ascii=False),
        old=json.dumps(old_prefixes(app)),
    )


def main():
    check = "--check" in sys.argv
    stale = []
    for app in sorted(p for p in APPS.iterdir() if (p / "index.html").is_file() and (p / "sw.js").is_file()):
        content = render(app)
        target = app / "sw.js"
        if target.read_text(encoding="utf-8") != content:
            if check:
                stale.append(app.name)  # signalé, pas réécrit
            else:
                target.write_text(content, encoding="utf-8")  # réécrit
                print(f"sw.js régénéré : {app.name}")
    if stale:
        print("sw.js pas à jour (lancez python scripts/build_sw.py) : " + ", ".join(stale))
        return 1
    if check:
        print("OK : tous les service workers sont à jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
