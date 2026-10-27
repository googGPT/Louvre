#!/usr/bin/env python3
"""Garde-fou : une appli modifiée doit aussi changer son service worker.

Pourquoi : un service worker « cache d'abord » ressert indéfiniment les anciens
fichiers tant que sw.js ne change pas. Le navigateur ne réinstalle le service
worker (et ne retélécharge l'appli) que si le contenu de sw.js change. Ce script
compare deux commits et échoue si les fichiers servis d'une appli ont changé
alors que son sw.js est resté identique.

Usage : python scripts/check_sw_cache_bump.py [BASE] [HEAD]
        (par défaut BASE=origin/main et HEAD=HEAD)
"""

import re  # expressions régulières, pour lire le nom du cache dans sw.js
import subprocess  # pour appeler git depuis Python
import sys  # pour lire les arguments et renvoyer un code de sortie

# Fichiers d'une appli qui ne sont pas servis aux visiteurs : leur
# modification ne nécessite pas de nouveau cache.
IGNORED_SUFFIXES = (".md",)  # la documentation n'est pas mise en cache
IGNORED_DIRS = ("tests/",)  # les tests ne sont jamais téléchargés par l'appli

# Repère une chaîne versionnée du type 'louvre-fuelmath-shell-v2' dans sw.js.
VERSION_RE = re.compile(r"['\"]([A-Za-z0-9._:-]*-v[0-9][A-Za-z0-9._-]*)['\"]")


def git(*args):
    """Lance une commande git et renvoie sa sortie texte."""
    result = subprocess.run(  # exécute git avec les arguments donnés
        ["git", *args], capture_output=True, text=True, check=False
    )
    if result.returncode != 0:  # git a échoué (fichier absent, commit inconnu…)
        return None  # on signale l'absence par None
    return result.stdout  # sinon on renvoie le texte produit


def cache_versions(ref, slug):
    """Renvoie l'ensemble des noms de cache versionnés de sw.js à un commit."""
    text = git("show", f"{ref}:apps/{slug}/sw.js")  # contenu de sw.js à ce commit
    if text is None:  # pas de sw.js à ce commit
        return set()  # aucun nom de cache
    return set(VERSION_RE.findall(text))  # toutes les chaînes versionnées trouvées


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"  # commit de référence
    head = sys.argv[2] if len(sys.argv) > 2 else "HEAD"  # commit à contrôler

    diff = git("diff", "--name-only", f"{base}...{head}", "--", "apps/")  # fichiers modifiés
    if diff is None:  # base ou head introuvable
        print(f"Impossible de comparer {base} et {head}.")  # message clair
        return 2  # code d'erreur distinct d'un échec du contrôle

    changed = {}  # dictionnaire : appli -> liste de ses fichiers modifiés
    for path in diff.split():  # parcourt chaque chemin modifié
        parts = path.split("/", 2)  # ex. ['apps', 'fuelmath', 'app.js']
        if len(parts) < 3:  # fichier directement dans apps/, hors appli
            continue  # on l'ignore
        slug, rest = parts[1], parts[2]  # nom de l'appli et chemin interne
        changed.setdefault(slug, []).append(rest)  # range le fichier sous son appli

    problems = []  # liste des applis en défaut
    for slug, files in sorted(changed.items()):  # examine chaque appli touchée
        if git("cat-file", "-e", f"{head}:apps/{slug}/sw.js") is None:  # pas de service worker
            continue  # rien à contrôler (appli sans cache hors ligne)
        served = [  # fichiers réellement servis aux visiteurs
            f for f in files
            if not f.endswith(IGNORED_SUFFIXES) and not f.startswith(IGNORED_DIRS)
        ]
        if not served:  # seuls des tests ou de la doc ont changé
            continue  # aucun nouveau cache n'est nécessaire
        if "sw.js" not in files:  # code modifié mais service worker identique
            problems.append(f"{slug} : {', '.join(served)} modifié(s) sans changement de sw.js")
            continue  # inutile de comparer les versions
        before = cache_versions(base, slug)  # noms de cache avant
        after = cache_versions(head, slug)  # noms de cache après
        if before and before == after:  # sw.js modifié mais même nom de cache
            problems.append(f"{slug} : sw.js modifié mais nom de cache inchangé ({', '.join(sorted(after))})")

    if problems:  # au moins une appli en défaut
        print("Nom de cache à incrémenter (ex. shell-v1 -> shell-v2) :")  # consigne
        for p in problems:  # liste chaque problème
            print(f"  - {p}")
        return 1  # échec : la CI bloque la PR
    print("OK : chaque appli modifiée a un nouveau nom de cache.")  # tout va bien
    return 0  # succès


if __name__ == "__main__":  # exécution directe du script
    sys.exit(main())  # renvoie le code de sortie à la CI
