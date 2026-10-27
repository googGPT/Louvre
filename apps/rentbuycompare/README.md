# RentBuyCompare

Comparaison location / achat d'un logement, sur hypothèses, gratuite, sans compte et hors ligne.

- Hypothèses saisies : prix, apport, frais d'achat, taux et durée du prêt (amortissable, mensualités constantes), charges et taxes annuelles, entretien annuel et leur évolution, loyer mensuel et son évolution, revalorisation du bien, rendement de l'apport placé, horizon (1 à 40 ans).
- Méthode : les deux choix partent du même apport. Coût net de l'achat = apport + mensualités + charges et entretien − (valeur du bien − capital restant dû) ; coût net de la location = loyers − gains de l'apport placé (capitalisé chaque mois).
- Résultats : verdict à l'horizon, point d'équilibre (première année à partir de laquelle l'achat reste moins coûteux), tableau annuel, graphique SVG.
- Calculs en centimes ; taux en points de base ; recalcul et enregistrement immédiats à chaque saisie valide.
- Exports CSV (tableau annuel) et SVG (graphique) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Ce sont des calculs sur hypothèses, pas une prévision ni un conseil financier : l'appli ne propose aucun prix ni taux et ne connaît aucune règle fiscale. Non pris en compte : frais de revente, impôts, assurance du prêt, placement des écarts de dépenses mensuelles. Les valeurs de l'exemple sont de simples illustrations.

Tests : `bash scripts/test_app.sh rentbuycompare`.
