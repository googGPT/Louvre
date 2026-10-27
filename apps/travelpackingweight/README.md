# TravelPackingWeight

Pesée des bagages avant un voyage, gratuite, sans compte et hors ligne.

- Poids total de chaque bagage : poids à vide + objets × quantité (saisie en kg, g, lb ou oz ; calculs en grammes entiers).
- Comparaison aux limites saisies par type (cabine, soute, objet personnel) ; dépassements et marge restante signalés.
- Propositions de déplacement : pour chaque bagage en excès, la plus petite unité qui résorbe l'excès, sinon les plus lourdes d'abord, vers le bagage le mieux ajusté ; les objets « à garder » ne bougent pas ; les excès impossibles à résorber sont signalés. Les propositions peuvent être appliquées.
- Plusieurs voyages ; export CSV ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : aucune règle de compagnie n'est préenregistrée (dimensions, nombre de bagages, objets interdits non vérifiés) ; heuristique de déplacement, pas une optimisation exhaustive.

Tests : `bash scripts/test_app.sh travelpackingweight`.
