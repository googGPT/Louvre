# LoanSim — Louvre App Factory vague 2

**Problème** : Échéancier de prêt amortissable, mensualité et économie liée à un remboursement anticipé.

**Anti-doublon (27 applications)** : MoneyUntil (budget jusqu’à la paie) et FuelMath (déplacement) — aucun échéancier de crédit.

**Fonctions** : Prêt amortissable fixe, simulation d’extra mensuel, coûts et économie d’intérêts, graphe, tableau mensuel et CSV.

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

- Les mensualités sont des simulations hors assurance, TVA éventuelle, réglementation, pénalités contractuelles et autres conditions réelles.
- Une PWA hors ligne exige un premier chargement réussi et un navigateur compatible ; aucun push en arrière-plan.
- Aucun compte distant ; exporter régulièrement la sauvegarde lorsque des données sont enregistrées.
