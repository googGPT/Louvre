# TransitCompare

Comparateur d'itinéraires saisis, gratuit, sans compte et hors ligne.

- Trajets enregistrés (ex. « Domicile → travail »), chacun avec jusqu'à 8 itinéraires de 12 segments au plus.
- Segment : mode (marche, bus, tram, métro, train, voiture, vélo, trottinette, taxi, autre), durée, attente avant, prix, précision.
- Totaux par itinéraire : durée totale, temps en véhicule, marche, attente, prix, correspondances (chaque montée dans un véhicule après la première).
- Coût généralisé selon **vos** pondérations : prix + valeur du temps × (minutes en véhicule + marche × poids + attente × poids + correspondances × pénalité en minutes) / 60. Calcul exact en centimes et dixièmes de minute.
- Classement expliqué (écarts de prix, de durée, de correspondances) et valeur du temps de bascule entre les deux premiers.
- Export CSV du classement (en-têtes traduits), sauvegarde JSON validée champ par champ, mode protégé si le stockage est illisible.

Limites : aucun horaire ni tarif n'est consulté ; les pondérations par défaut sont neutres (×1, aucune pénalité, temps à 0) et celles de l'exemple sont des valeurs de démonstration, sans source.

Tests : `bash scripts/test_app.sh transitcompare`.
