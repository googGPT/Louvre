# RoadTripCost

Coût d'un voyage routier par étape et par personne, gratuit, sans compte et hors ligne.

- Voiture : consommation saisie en L/100 km, km/L ou mpg (US, UK) ; prix du carburant par litre ou par gallon (US, impérial). Conversions exactes ; stockage en mL/100 km et en millièmes d'unité monétaire par litre.
- Étapes : distance (km ou mi), prix du carburant propre à l'étape (facultatif), péages, hébergement, repas, autres frais ; carburant = distance × consommation × prix, arrondi au centime par étape.
- Partage : chaque étape est répartie à parts égales entre les passagers cochés ; les centimes restants tournent d'une étape à l'autre, le total reste exact. Coût total, par étape, par personne, par poste et par km (ou mile).
- Export CSV (en-têtes traduits, devise indiquée), impression ; plusieurs voyages ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : aucun prix, barème kilométrique ou consommation n'est fourni ; ce sont des calculs sur les hypothèses saisies. Pas de remboursements entre passagers (qui a payé quoi).

Tests : `bash scripts/test_app.sh roadtripcost`.
