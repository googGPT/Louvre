# HomeEnergyLog

Carnet de relevés de compteurs (électricité, gaz, eau), gratuit, sans compte et hors ligne.

- Compteurs avec unité explicite (kWh ; m³ ou kWh pour le gaz ; m³ ou L pour l'eau) et prix unitaire facultatif saisi par l'utilisateur.
- Consommation entre deux relevés, moyenne par jour, répartition par mois civil au prorata des jours (mois incomplets signalés).
- Comparaison de deux périodes par la consommation moyenne par jour.
- Un index inférieur au précédent est refusé à la saisie, sauf « compteur remplacé » ; s'il arrive par une sauvegarde, il est signalé et sa période n'est pas comptée.
- Index en millièmes d'unité, prix en 1/10 000, coûts en centimes ; dates en jours civils. Export CSV ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : calculs sur les index et prix saisis, sans abonnement ni taxes ; la répartition mensuelle suppose une consommation uniforme entre deux relevés.

Tests : `bash scripts/test_app.sh homeenergylog`.
