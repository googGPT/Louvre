# SizeMatch

Convertir poids, distance et température hors ligne

Application Louvre App Factory indépendante, statique, gratuite, fonctionnant sans API payante.

## Fonctions
- Saisie et édition de fiches métier, recherche, suppression confirmée.
- **Calcul métier local :** Convertir des mesures quotidiennes.
- Tableaux de bord recalculés après chaque modification.
- Export JSON et restauration contrôlée avant modification des fiches locales.
- Installation Web progressive et hors ligne après le premier chargement valide.

## Utilisation
Ouvrir `index.html` sur un serveur local HTTP, ou accéder au chemin `apps/sizematch/` après fusion et publication GitHub Pages. Pour tests : `node --test tests/core.test.cjs` et `python tests/browser.test.py`.

## Coûts, vie privée, limites
Aucune API ni base serveur ni compte. Les données restent dans le navigateur. Exporter les fichiers JSON régulièrement, sans les publier. Les champs sont fournis par l'utilisateur, sans validation de sources officielles.
