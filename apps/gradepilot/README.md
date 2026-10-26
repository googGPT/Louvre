# GradePilot — Louvre App Factory vague 2

**Problème** : Moyenne scolaire et note nécessaire pour atteindre un objectif académique.

**Anti-doublon (27 applications)** : StudyRecall (révisions) — pas de calcul de moyenne ni scénarios pondérés.

**Fonctions** : Gestion de notes pondérées, édition/suppression, moyenne, note requise, statut impossible/acquis, export/import JSON.

**Exploitation** : 100 % locale, sans serveur, clé ni API payante. GitHub Pages sur domaine public gratuit sous réserve de quotas et conditions. Les données importées restent sur l'appareil ; pas de synchronisation.

## Vérifier

```sh
node --check core.js
node --check app.js
node --test tests/core.test.cjs
python tests/browser.test.py
```

Le test Chrome utilise Chromium via Playwright et un serveur local temporaire. Si la navigation locale est bloquée dans l'environnement de création, utiliser les résultats du workflow GitHub Actions de la PR.

## Limites

- Projections purement mathématiques, sans règles administratives propres aux établissements.
- Une PWA hors ligne exige un premier chargement réussi et un navigateur compatible ; aucun push en arrière-plan.
- Aucun compte distant ; exporter régulièrement la sauvegarde lorsque des données sont enregistrées.
