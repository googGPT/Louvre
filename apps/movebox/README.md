# MoveBox

Inventaire des cartons d'un déménagement, gratuit, sans compte et hors ligne.

- Carton : numéro unique (proposé automatiquement), pièce de destination (les pièces existantes sont réutilisées sans doublon de casse), contenu (un objet par ligne), fragile, poids en kg (stocké en grammes entiers), notes.
- Recherche d'un objet sans accents ni casse, sur plusieurs mots, ou par numéro (`#12`).
- Suivi « emballé → chargé → livré → ouvert », carton par carton ou pour tous les cartons affichés (filtres par statut et par pièce) ; totaux par statut et par pièce, poids connu, cartons sans poids.
- Limite de poids par carton choisie par l'utilisateur (aucune valeur imposée) : les cartons au-dessus sont signalés.
- Étiquettes imprimables (gros numéro, pièce en couleur, FRAGILE, sens « haut ») ; export CSV de l'inventaire (en-têtes et statuts traduits).
- Sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible ; 999 cartons au plus.

Tests : `bash scripts/test_app.sh movebox`.
