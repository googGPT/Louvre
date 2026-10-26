# DecisionDeck Web 2.0

**Objectif :** comparer plusieurs options selon une grille commune de critères, avec classement pondéré explicable et diagnostic automatique de comparabilité. Web statique, sans compte, sans API payante, utilisable hors ligne après installation du cache PWA.

## Ce qui est opérationnel

- Ajout, modification, suppression de notes (une option × un critère), recherche tolérante aux accents, suggestions de noms et reprise automatique du poids d'un critère existant.
- Rejet d'un doublon dès la saisie ; comparaison suspendue si un critère manque ou si un poids est incohérent. Variantes de casse, espaces et accents regroupées pour diagnostiquer les doublons.
- Moyenne pondérée `Σ(note × poids) / Σ(poids)` ; **10 correspond toujours au meilleur résultat**, même pour des coûts.
- Matrice avec contributions pondérées, barres de score, test de sensibilité **un poids à la fois** (`×2` et `÷2`), sans modifier les données enregistrées.
- Exemple guidé de 2 options × 3 critères, ajout volontaire sans effacer les données existantes.
- Exports CSV (traitement des cellules ressemblant à des formules) et JSON ; import validé et confirmé avant remplacement ; sauvegardes existantes v1 conservées sans migration destructive.
- PWA, fichiers accessibles hors ligne après première visite réussie et installation. **Aucune notification en arrière-plan**.

## Cas d'usage

Comparer des achats, méthodes pédagogiques, destinations ou prestataires avec une grille cohérente. Le classement dépend de **vos évaluations subjectives**, pas d'une source officielle ; tester deux modifications de poids ne prouve pas la robustesse globale. Un seul profil de préférences est enregistré localement.

## Tests

Depuis la racine du dépôt :

```bash
node --check apps/decisiondeck/core.js
node --check apps/decisiondeck/app.js
node --test apps/decisiondeck/tests/core.test.cjs
python apps/decisiondeck/tests/browser.test.py
```

Le dernier test nécessite Playwright, Chromium et le droit d'ouvrir `localhost` ; GitHub Actions exécute le test navigateur pour chaque PR.

## Confidentialité et coûts

Aucune requête métier distante, aucun appel API payant et aucun compte. Les données sont stockées localement dans `localStorage` sous la clé `louvre-factory:decisiondeck:v1` (500 fiches maximum). Les données disparaissent en cas de suppression du stockage du navigateur. Effectuer régulièrement un export JSON ; le fichier peut contenir des informations privées. La mise en ligne sur GitHub Pages dépend de ses conditions et quotas gratuits.