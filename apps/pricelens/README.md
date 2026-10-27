# PriceLens

Comparateur de prix unitaires, gratuit, sans compte et hors ligne.

- Prix au kilo, au litre ou à la pièce, à partir du prix payé, de la contenance (g, kg, ml, cl, L, pièces) et du nombre d'unités d'un lot (« 6 × 33 cl »).
- Classement du moins cher au plus cher, écart en % avec le meilleur prix, économie du meilleur sur le plus cher.
- Masses, volumes et pièces sont classés séparément (ils ne se comparent pas).
- Calculs en centimes ; le classement utilise des comparaisons exactes (sans arrondi).
- Plusieurs comparaisons enregistrées ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : les prix sont saisis par l'utilisateur ; aucune donnée de magasin n'est consultée.

Tests : `bash scripts/test_app.sh pricelens`.
