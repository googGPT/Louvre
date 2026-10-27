# PriceJournal

Carnet de relevés de prix, gratuit, sans compte et hors ligne.

- Relevé : produit, magasin, date (jour civil), prix payé, contenance et unité (g, kg, ml, cl, L, pièces), nombre d'unités d'un lot.
- Prix unitaire au kilo, au litre ou à la pièce ; un produit garde la même sorte d'unité (masse, volume ou pièces).
- Par produit : évolution dans le temps (graphique SVG, une ligne par magasin), variation en % entre le premier et le dernier relevé, meilleur prix observé (magasin et date), écart du dernier prix avec le meilleur, dernier prix par magasin.
- Calculs en centimes ; comparaisons exactes des prix unitaires (sans arrondi) ; 2 000 relevés au plus.
- Exports CSV (tous les relevés) et SVG (graphique) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : les prix sont relevés par l'utilisateur ; aucune donnée de magasin n'est consultée. La variation compare deux relevés, pas une moyenne ni un indice des prix. Les prix de l'exemple sont de simples illustrations.

Tests : `bash scripts/test_app.sh pricejournal`.
