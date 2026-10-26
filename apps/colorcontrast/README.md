# ColorContrast — Louvre App Factory vague 2

**Problème** : Contraste WCAG 2.x entre texte et fond, design de palettes lisibles.

**Anti-doublon (27 applications)** : Aucune application parmi les 27 ne calcule de luminance relative ni conformité AA/AAA.

**Fonctions** : Saisie HEX/sélecteurs, contraste WCAG, prévisualisation, conformité AA/AAA, recommandation noir/blanc, favoris, export/import.

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

- La conformité de contraste ne suffit pas à certifier l’accessibilité d’un produit.
- Une PWA hors ligne exige un premier chargement réussi et un navigateur compatible ; aucun push en arrière-plan.
- Aucun compte distant ; exporter régulièrement la sauvegarde lorsque des données sont enregistrées.
