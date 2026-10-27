# MealCalendar

Menus de la semaine et liste de courses agrégée, gratuit, sans compte et hors ligne.

- Plats enregistrés avec leurs portions et leurs ingrédients (quantité + unité explicite : g, kg, ml, cl, L, c. à café, c. à soupe, pièces).
- Semaine du lundi au dimanche × petit-déjeuner, déjeuner, dîner ; nombre de personnes par repas (quantités recalculées par règle de trois sur les portions du plat).
- Liste de courses : même ingrédient (nom sans accents ni casse) et unités compatibles additionnés, en entiers (pas d'erreur d'arrondi) ; unités incompatibles (pièces et grammes) gardées sur des lignes séparées. Cochable, exportable en CSV (en-têtes et unités traduits), imprimable.
- Cuillères converties selon les conventions métriques (5 ml et 15 ml), rappelées dans l'interface.
- Sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible ; 104 semaines conservées au plus.

Limites : aucun conseil nutritionnel ; pas de conversion entre masse et volume (densités inconnues).

Tests : `bash scripts/test_app.sh mealcalendar`.
