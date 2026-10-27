#!/usr/bin/env bash
# Teste une appli Louvre de bout en bout : syntaxe, manifeste, HTML miroir,
# tests métier (Node) puis test navigateur (Chromium).
# Usage : scripts/test_app.sh <slug>      ex. scripts/test_app.sh fuelmath
# Le même script sert à la CI et en local : une seule recette pour les 32 applis.
set -euo pipefail                      # arrête au premier échec, refuse les variables inconnues

slug="${1:?usage: scripts/test_app.sh <slug>}"   # nom du dossier de l'appli (obligatoire)
dir="apps/$slug"                       # chemin du dossier de l'appli
test -f "$dir/index.html"              # une appli publiée a toujours un index.html

for js in core.js app.js sw.js; do     # fichiers JavaScript habituels
  if [ -f "$dir/$js" ]; then           # seulement s'ils existent (MoneyUntil n'en a pas)
    node --check "$dir/$js"            # vérifie la syntaxe sans exécuter
  fi
done

if [ -f "$dir/manifest.webmanifest" ]; then      # manifeste de l'appli installable
  node -e "JSON.parse(require('fs').readFileSync('$dir/manifest.webmanifest','utf8'))"  # doit être du JSON valide
fi

if [ -f "$dir/messages.js" ]; then                # appli multilingue
  node scripts/check_messages.cjs "$slug"        # toutes les langues complètes et cohérentes
  cmp shared/louvre-i18n.js "$dir/louvre-i18n.js"   # copie du mécanisme commun à jour
  cmp shared/louvre-i18n.css "$dir/louvre-i18n.css"
fi

if [ -f "$dir/index.htm" ]; then                 # copie historique de index.html
  cmp "$dir/index.html" "$dir/index.htm"         # doit rester strictement identique
fi

for t in "$dir"/tests/*.test.cjs "$dir"/tests/*.test.mjs; do  # tests métier
  [ -f "$t" ] || continue                        # ignore un motif sans fichier
  TZ=Europe/Paris node --test "$t"               # fuseau fixe : résultats de dates reproductibles
done

if [ -f "$dir/tests/browser.test.py" ]; then     # test dans un vrai navigateur
  python "$dir/tests/browser.test.py"            # Chromium : LOUVRE_CHROMIUM ou /usr/bin/chromium
fi

echo "LOUVRE_APP_PASS $slug"                     # marqueur lisible dans les journaux
