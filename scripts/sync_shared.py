#!/usr/bin/env python3
"""Copie le mécanisme multilingue commun (shared/louvre-i18n.*) dans chaque appli multilingue.

Une appli est multilingue si elle contient messages.js. La copie locale permet le
fonctionnement hors ligne (le service worker de l'appli ne met en cache que son dossier).

Usage : python scripts/sync_shared.py          (met à jour les copies)
        python scripts/sync_shared.py --check  (échoue si une copie diffère de la source)
"""
import pathlib  # parcours des dossiers
import sys  # arguments et code de sortie

ROOT = pathlib.Path(__file__).resolve().parent.parent  # racine du dépôt
FILES = ["louvre-i18n.js", "louvre-i18n.css"]  # fichiers partagés


def only():
    """Slugs passés après --only (ex. --only fuelmath parkwise) ; vide = toutes les applis."""
    return set(sys.argv[sys.argv.index("--only") + 1:]) if "--only" in sys.argv else set()


def main():
    check = "--check" in sys.argv
    stale = []
    targets = [a for a in sorted((ROOT / "apps").iterdir()) if (a / "messages.js").is_file()]  # applis multilingues
    if (ROOT / "assets" / "home-messages.js").is_file():
        targets.append(ROOT / "assets")  # la page d'accueil aussi
    keep = only()
    if keep:
        targets = [a for a in targets if a.name in keep]  # --only : ne touche pas aux autres applis
    for app in targets:
        for name in FILES:
            src, dst = ROOT / "shared" / name, app / name
            if not dst.is_file() or dst.read_bytes() != src.read_bytes():
                if check:
                    stale.append(f"{app.name}/{name}")
                else:
                    dst.write_bytes(src.read_bytes())  # copie exacte
                    print(f"copié : {app.name}/{name}")
    if stale:
        print("Copies du mécanisme multilingue périmées (lancez python scripts/sync_shared.py) : " + ", ".join(stale))
        return 1
    if check:
        print("OK : mécanisme multilingue à jour dans chaque appli.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
