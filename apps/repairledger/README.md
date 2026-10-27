# RepairLedger

Carnet de réparations d'objets personnels (hors logement), gratuit, sans compte et hors ligne.

- Objets : nom, catégorie, date d'achat facultative, prix d'achat (centimes entiers), seuil de remplacement saisi par l'utilisateur (% du prix d'achat).
- Réparations datées (jours civils) : coût (zéro permis), prestataire, travaux, garantie de réparation en mois (fin calculée avec jour borné : 31 janvier + 1 mois = fin février) ou par date de fin.
- Bilan par objet : coût cumulé, part du prix d'achat, seuil atteint ou montant restant avant le seuil. L'appli compare ; elle ne conseille pas.
- Rappels : garanties qui se terminent dans les N jours choisis ; signalement d'une réparation qui tombe pendant la garantie d'une réparation précédente du même objet (« à vérifier »).
- Exports : CSV des réparations (en-têtes traduits, devise choisie), agenda .ics des fins de garantie (avec alarme N jours avant) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : montants dans la devise choisie, sans conversion ; les conditions réelles de garantie sont à vérifier auprès du prestataire.

Tests : `bash scripts/test_app.sh repairledger`.
