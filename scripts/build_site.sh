#!/usr/bin/env bash
# Assemble le site GitHub Pages dans _site/ : page d'accueil + toutes les applis.
# Chaque dossier apps/<slug>/ contenant un index.html est publié automatiquement,
# avec tous ses fichiers (y compris les sous-dossiers comme vendor/), sauf les tests.
# Usage : scripts/build_site.sh
set -euo pipefail                         # arrête au premier problème

rm -rf _site                              # repart d'un dossier vide
mkdir -p _site/apps _site/assets          # structure du site

python scripts/build_home.py --check      # la page d'accueil doit être à jour et complète
python scripts/apply_csp.py --check      # chaque page d.appli porte sa politique de sécurité à jour
python scripts/build_sw.py --check        # chaque service worker doit correspondre au contenu de son appli
cp index.html _site/index.html            # page d'accueil
cp assets/home.css assets/home.js _site/assets/   # styles et script de l'accueil
touch _site/.nojekyll                     # GitHub Pages sert les fichiers tels quels

count=0                                   # nombre d'applis publiées
for app in apps/*/; do                    # parcourt chaque dossier d'appli
  slug="$(basename "$app")"               # ex. 'fuelmath'
  [ -f "$app/index.html" ] || continue    # ignore ce qui n'est pas une appli
  mkdir -p "_site/apps/$slug"             # dossier de destination
  # copie tout sauf les tests et la revue interne
  tar -C "$app" --exclude='./tests' --exclude='./LOUVRE-REVIEW.md' -cf - . | tar -C "_site/apps/$slug" -xf -
  if [ -f "$app/sw.js" ]; then            # appli hors ligne : vérifie ses fichiers mis en cache
    # chaque fichier listé dans ASSETS doit exister dans le site publié
    python - "$slug" <<'PY'
import re, sys, pathlib
slug = sys.argv[1]                                        # appli contrôlée
sw = pathlib.Path(f"_site/apps/{slug}/sw.js").read_text()  # service worker publié
m = re.search(r"ASSETS\s*=\s*\[([^\]]*)\]", sw)            # liste des fichiers mis en cache
if m:
    for raw in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)):  # chaque chemin listé
        path = raw.split("?")[0].lstrip("./") or "index.html"     # './' = index.html
        if not pathlib.Path(f"_site/apps/{slug}/{path}").is_file():
            sys.exit(f"{slug} : {raw} est mis en cache mais absent du site")
PY
  fi
  count=$((count + 1))                    # une appli de plus
done

echo "LOUVRE_SITE_BUILT $count app(s)"    # résumé dans le journal
