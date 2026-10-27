# RecipeScaler

Mise à l'échelle de recettes, gratuite, sans compte et hors ligne.

- Recette : titre, portions, ingrédients (quantité + unité : g, kg, ml, cl, L, c. à café, c. à soupe, pièces, pincées, « au goût »), préparation.
- Recalcul pour un nombre de portions, ou d'après la quantité disponible d'un ingrédient (même dimension obligatoire : aucune conversion masse ↔ volume).
- Conversions cohérentes : g ↔ kg, ml ↔ cl ↔ L, 3 c. à café = 1 c. à soupe (5 ml / 15 ml), au-delà de 4 c. à soupe en ml.
- Arrondis lisibles (½ g sous 10 g, 5 g au-delà de 100 g…), signalés par « ≈ ». Œufs et autres ingrédients à l'unité : entiers (ou ½ sous 1), valeur exacte affichée ; « au goût » jamais recalculé.
- Recettes enregistrables ; impression et export texte de la recette adaptée ; sauvegarde JSON validée ; mode protégé si le stockage est illisible.

Limites : temps de cuisson et taille du moule non recalculés (dit dans l'interface) ; aucun conseil nutritionnel.

Tests : `bash scripts/test_app.sh recipescaler`.
