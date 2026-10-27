# CommuteCarbon

Estimation des émissions de trajets réguliers, gratuite, sans compte et hors ligne.

- Facteurs d'émission saisis et modifiables par l'utilisateur, en g CO₂e/km (0 admis, 3 décimales au plus) : « par véhicule-km » (partagé entre les occupants, covoiturage) ou « par passager-km » (appliqué à chaque personne). L'appli ne fournit aucune valeur officielle ; le bouton « Exemple » charge des valeurs arbitraires, nommées « exemple à remplacer ».
- Trajets : distance aller avec unité explicite (km ou miles, convertie en mètres entiers), mode, occupants (vous compris), aller-retour, jours par semaine.
- Totaux par semaine, par mois (année / 12) et par an selon le nombre de semaines de trajets saisi ; calcul exact en entiers (mg CO₂e) avant l'arrondi final.
- Scénarios multiples (créer, dupliquer, renommer) et comparaison avec une référence choisie : écart annuel en kg et en %, scénario le plus sobre.
- Export CSV (en-têtes traduits, décimale de la langue, cellules protégées contre les formules) ; sauvegarde JSON validée champ par champ ; mode protégé si le stockage est illisible.

Limites : 30 facteurs, 20 scénarios, 30 trajets par scénario ; distance aller de 0,1 à 1 000 km ou mi ; un facteur utilisé par un trajet ne peut pas être supprimé. Les résultats ne valent que ce que valent les facteurs saisis.

Tests : `bash scripts/test_app.sh commutecarbon`.
