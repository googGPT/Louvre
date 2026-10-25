# FridgeFirst — traçabilité des cinq ouvrages Louvre

**Périmètre et méthode.** Les cinq fiches ci-dessous ont été lues dans `googGPT/Louvre` pour préparer FridgeFirst. Elles synthétisent des lectures ciblées des livres effectuées dans une autre phase du projet. Les numéros indiqués sont des **pages physiques PDF rapportées par ces fiches**, non une revendication de relecture intégrale des livres dans cet environnement. Les décisions et le code sont des **adaptations originales** ; aucun long extrait protégé ni PDF n'est publié.

| Ouvrage référencé dans Louvre | Fiche consultée et identification | Application originale effective | Ce qu'elle ne prouve pas |
|---|---|---|---|
| **Total TypeScript: The Essentials** (SRC-001, 2026) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` ; ch. 16 ; PDF p. 396–400 | `core.js` applique la validation runtime stricte : formes exactes, dates impossibles, bornes de quantités, identifiants uniques et schéma de sauvegarde avant import | Il n'y a pas de compilateur TS ici. Une garde type seule ne rend pas les entrées fiables sans contrôle de chaque champ |
| **The Complete Developer** (SRC-002, 2024) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` ; ch. 8 ; PDF p. 160–174 | 42 tests Node indépendants sur les règles métier, plus un test Playwright/Chromium bout-en-bout pour vérifier que le DOM et la persistance concordent | Les tests ne certifient ni tous les navigateurs ni une sécurité alimentaire réelle |
| **Ultimate Next.js for Modern Web Applications** (SRC-003, 2026) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` ; ch. 8 ; PDF p. 212–226 | `app.js` conserve un état canonique local et dérive toutes les statistiques, listes triées et recommandations via `core.js`. La vue ne stocke pas des compteurs parallèles | Next.js et son rendu serveur ne sont pas nécessaires, donc pas installés |
| **Building Real-World Web Applications with Vue.js 3** (SRC-004, 2024) | `technical-library/concepts/frontend/VUE05-001-pinia-state.md` ; ch. 5 ; PDF p. 133–144 | Actions explicites sur l'inventaire et getters dérivés (`analytics`, `recipeSuggestions`), recalcul après une mutation unique; `core.js` sans dépendance UI prépare de futures interfaces mobiles | Aucun Pinia ou Vue n'est exécuté ; ce sont des principes de gestion d'état repris hors de Vue |
| **Learning GitHub Actions** (SRC-005, 2023) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` ; ch. 9 ; PDF p. 210–220 | Tests avec `contents:read`, publication dans un job séparé avec `pages:write` et `id-token:write` uniquement après succès des tests ; contrôle HTTP du site public | Une CI verte ne prouve pas l'absence de bugs, et les règles GitHub ont pu évoluer depuis 2023 |

## Algorithme de classement : conception originale FridgeFirst

Pour un ingrédient normalisé `g`, un produit est **disponible pour les propositions** si la quantité saisie est positive et si sa date indiquée n'est pas antérieure à la date locale. Pour une recette de `n` ingrédients, `h` disponibles, `m` manquants et `u` disponibles dont la date est dans les deux prochains jours :

`score = 100 * h / n + 12 * u - 7 * m`.

Le système trie les quinze recettes par score décroissant, puis par nom. Cette **heuristique de classement**, et non une IA ni une formule tirée des livres, favorise à la fois la faisabilité et la priorité des aliments proches de leur date. Elle ne mesure pas les calories, les valeurs nutritionnelles ni la sécurité réelle. Les noms d'ingrédients sont normalisés par dictionnaire et alias locaux, non par reconnaissance automatique d'images.

## Gestion des erreurs et invariants

- Sauvegarde et import au format exact `version:1`, jusqu'à 1 000 aliments, 3 000 actions, 500 produits à acheter ; import JSON limité à 1 Mo dans l'interface.
- Tous les éléments importés sont validés **avant** `localStorage.setItem`. Une sauvegarde malformée ne remplace pas l'existante.
- Si `localStorage` est indisponible ou si des données locales sont corrompues, FridgeFirst affiche un problème et refuse d'enregistrer des modifications pour **ne pas écraser silencieusement** les anciennes données. Une restauration valide reste une action confirmée et volontaire.
- Les nombres d'objets déclarés consommés/jetés sont distincts des quantités ; aucune économie monétaire n'est inventée.
- Les sorties HTML dynamiques encodent les champs utilisateurs et ne traitent jamais un nom de produit comme du HTML de confiance.

## Tests exécutés / limites de vérification

- Dans l'environnement local de création : **42/42 tests métier Node réussis** et syntaxe JavaScript vérifiée.
- Dans l'environnement local de création : la navigation Playwright vers le serveur de test HTTP a renvoyé `ERR_BLOCKED_BY_ADMINISTRATOR` ; **aucun succès navigateur local** ne peut être revendiqué. Le script est intégré au workflow GitHub Actions afin d'obtenir une vérification Chrome indépendante.
- Au moment de la PR, vérifier le résultat *réel* de la CI sur la branche. Après fusion seulement, contrôler la page publique `https://googgpt.github.io/Louvre/apps/fridgefirst/` et les trois premières apps. Ne jamais prétendre qu'un déploiement PR est déjà public.