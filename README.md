# Atlas Journaux

Site d'aide au choix d'une revue (classements FNEGE, AJG/ABS, ABDC, FT50, indicateurs SCImago et OpenAlex, frais, recherche par résumé).
Site publié : https://claude.ai/artifact/SkNR9du8en4tkeXEnxmwDE (artefact `d082a59b-f0ff-4056-b9e2-2da7f8f3e60d`, public).

## Contenu
- `sources/` : fichiers fournis à la main — `fnege.xlsx` (FNEGE 2025), `abs.xlsx` (AJG 2024), `fees.json` (frais de soumission).
- `merge.py` → fusion des classements (+ corrections manuelles d'ISSN dans `MANUAL`).
- `enrich.py` → OpenAlex (éditeur, citations, accès ouvert, APC) ; `SID_OVERRIDE` force le bon rattachement de certaines revues.
- `works.py`, `extra_metrics.py`, `years.py` → articles, pays des auteurs, rétractations, articles par année (OpenAlex).
- `sjr.py` → SJR, quartile, h-index (dépôt GitHub SCImagoJournalRankIndicators).
- `build_data.py` → `site/data/journaux.json` et `site/data/corpus.json`.
- `site/` → la page publiée (`index.html`, `i18n.js`, `data/`).

## Mise à jour
`bash update.sh` (30 à 60 minutes, surtout les appels OpenAlex). Les fichiers intermédiaires vont dans `work/`, les sources externes dans `ext/` (non versionnés).

Contrôles après la mise à jour : nombre de revues proche du précédent (±3 %), 889 FNEGE, ~1 821 AJG, ~2 649 ABDC, 50 FT50, aucune valeur NaN.

## Nouvelle édition d'un classement
- FNEGE / AJG : remplacer le fichier dans `sources/` (même structure de colonnes) et relancer `update.sh`. AJG demande un compte sur charteredabs.org : à faire par le propriétaire.
- ABDC : récupéré automatiquement ; si les noms d'onglets changent (`2025 JQL`, `2022 JQL`), adapter `merge.py`.
- FT50 : liste écrite dans `merge.py`.
- Le quartile SJR est recalculé par domaine (ex aequo au rang le plus bas) ; il peut différer de SCImago pour environ 0,2 % des revues.
