# SavingsProjection

Projection d'épargne sur hypothèses, gratuite, sans compte et hors ligne.

- Plan : capital de départ, versement (mensuel, trimestriel ou annuel, en début ou en fin de période), durée de 1 à 60 ans, objectif facultatif.
- Jusqu'à 5 scénarios de taux annuels saisis par l'utilisateur (de −20 % à +30 %), capitalisés chaque mois (taux ÷ 12), intérêts arrondis au centime chaque mois.
- Résultats : solde final, part des versements et des intérêts, mois où l'objectif est atteint ; graphique SVG comparé ; tableau annuel.
- Exports CSV (tableau annuel) et SVG (graphique) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Ce sont des calculs sur hypothèses, pas une prévision : l'appli ne propose aucun taux, ne connaît aucun produit d'épargne et ne tient compte ni des frais, ni de l'inflation, ni des impôts. Les taux de l'exemple (1 %, 3 %, 5 %) sont présentés comme de simples illustrations.

Tests : `bash scripts/test_app.sh savingsprojection`.
