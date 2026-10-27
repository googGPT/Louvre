#!/usr/bin/env python3
"""Contrôle le site publié : accueil + chaque appli + chaque fichier mis en cache.

Pour chaque dossier apps/<slug>/ du dépôt, on télécharge la page publique,
on vérifie que c'est bien la bonne appli (scripts/verify_public_app.py),
puis on télécharge chaque fichier listé dans le service worker : un fichier
manquant casserait le mode hors ligne (cas de QRForge avec vendor/qrcode.js).

Usage : python scripts/smoke_site.py [URL_DE_BASE]
        (par défaut https://googgpt.github.io/Louvre/)
"""

import pathlib  # pour parcourir le dossier apps/
import re  # pour lire la liste ASSETS des service workers
import sys  # arguments et code de sortie
import time  # pauses entre deux tentatives
import urllib.request  # téléchargement sans dépendance externe

sys.path.insert(0, str(pathlib.Path(__file__).parent))  # rend verify_public_app importable
from verify_public_app import verify  # contrôle « c'est bien la bonne appli »

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://googgpt.github.io/Louvre/").rstrip("/") + "/"
ATTEMPTS = 24  # GitHub Pages peut mettre une minute ou deux à propager
PAUSE = 5  # secondes entre deux tentatives


def fetch(url):
    """Télécharge une URL et renvoie son contenu en octets (lève une erreur si échec)."""
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})  # évite un cache périmé
    with urllib.request.urlopen(req, timeout=15) as r:  # délai maximal de 15 s
        return r.read()  # contenu brut


def check_app(slug, folder):
    """Vérifie une appli publiée ; renvoie None si tout va bien, sinon un message."""
    site = f"{BASE}apps/{slug}/"  # adresse publique de l'appli
    html = fetch(site)  # page d'accueil de l'appli
    if (folder / "core.js").is_file():  # appli à plusieurs fichiers
        verify(slug, html, fetch(site + "core.js"))  # titre, script core.js, pas de page d'erreur
    elif slug.casefold() not in re.sub(rb"[^a-z0-9]", b"", html.lower()).decode():  # appli en un seul fichier
        return f"titre inattendu pour {slug}"
    sw = folder / "sw.js"  # service worker local
    if sw.is_file():
        m = re.search(r"ASSETS\s*=\s*\[([^\]]*)\]", sw.read_text(encoding="utf-8"))  # liste mise en cache
        for raw in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1) if m else ""):  # chaque fichier
            fetch(site + raw.lstrip("./"))  # doit répondre 200, sinon erreur
    return None


def main():
    apps = sorted(p for p in pathlib.Path("apps").iterdir() if (p / "index.html").is_file())  # applis du dépôt
    pending = {p.name: p for p in apps}  # applis restant à valider
    for attempt in range(1, ATTEMPTS + 1):  # plusieurs tentatives
        try:
            home = fetch(BASE).decode("utf-8")  # page d'accueil du site
            missing = [s for s in pending if f"./apps/{s}/" not in home]  # applis absentes de l'accueil
            if missing:
                raise ValueError("absentes de l'accueil : " + ", ".join(missing))
        except Exception as exc:  # accueil pas encore prêt
            print(f"accueil : {exc} (tentative {attempt}/{ATTEMPTS})")
            time.sleep(PAUSE)
            continue
        for slug, folder in list(pending.items()):  # teste chaque appli restante
            try:
                problem = check_app(slug, folder)
            except Exception as exc:  # téléchargement ou vérification échoué
                problem = str(exc)
            if problem is None:
                print(f"PUBLIC_SMOKE_PASS {slug}")
                del pending[slug]  # validée : on ne la reteste plus
            elif attempt == ATTEMPTS:
                print(f"PUBLIC_SMOKE_FAIL {slug} : {problem}")
        if not pending:  # tout est validé
            print(f"PUBLIC_SMOKE_PASS accueil + {len(apps)} applis")
            return 0
        time.sleep(PAUSE)  # attend avant de réessayer les applis restantes
    print("Échec : " + ", ".join(sorted(pending)), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
