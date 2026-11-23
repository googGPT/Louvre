#!/usr/bin/env bash
# Mise à jour complète d'Atlas Journaux (lancée tous les 6 mois par la tâche programmée).
set -euo pipefail                                   # arrêt à la première erreur
cd "$(dirname "$0")"                                # se placer dans le dossier du dépôt
export AJ_BASE="$PWD"                               # dossier de base lu par les scripts Python
mkdir -p work ext                                   # work = fichiers intermédiaires, ext = sources externes
pip install --quiet --break-system-packages openpyxl >/dev/null 2>&1 || true   # lecture des fichiers Excel
# 1. Sources externes publiques (GitHub)
rm -rf ext/abdc ext/sjr
git clone --depth 1 https://github.com/lukestein/abdc ext/abdc                                   # liste ABDC officielle
git clone --depth 1 https://github.com/Michael-E-Rose/SCImagoJournalRankIndicators ext/sjr      # SJR SCImago
python3 sjr.py ext/sjr/all.csv work/sjr.json        # SJR, quartile, h-index de la dernière année
# 2. Fusion des classements, puis enrichissement OpenAlex
python3 merge.py                                    # FNEGE + AJG + ABDC + FT50
python3 enrich.py                                   # éditeur, citations, accès ouvert, APC (OpenAlex)
python3 works.py                                    # articles les plus cités (recherche par résumé)
python3 extra_metrics.py                            # pays des auteurs, rétractations
python3 years.py                                    # nombre d'articles par année
# 3. Fichiers du site
python3 build_data.py                               # site/data/journaux.json et corpus.json
echo "Terminé : $(date)"
