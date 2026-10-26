# FuelMath

Estimer carburant et partage entre passagers

Application Louvre App Factory indépendante, statique, gratuite, fonctionnant sans API payante.

## Fonctions
- Saisie et édition de fiches métier, recherche, suppression confirmée.
- **Calcul métier local :** Estimer un trajet automobile.
- Tableaux de bord recalculés après chaque modification.
- Export JSON et restauration contrôlée avant modification des fiches locales.
- Installation Web progressive et hors ligne après le premier chargement valide.

## Utilisation
Ouvrir `index.html` sur un serveur local HTTP, ou accéder au chemin `apps/fuelmath/` après fusion et publication GitHub Pages. Pour tests : `node --test tests/core.test.cjs` et `python tests/browser.test.py`.

## Coûts, vie privée, limites
Aucune API ni base serveur ni compte. Les données restent dans le navigateur. Exporter les fichiers JSON régulièrement, sans les publier. Les champs sont fournis par l'utilisateur, sans validation de sources officielles.

## Exactitude des centimes
Le coût de chaque trajet est arrondi une fois au centime ; le partage distribue les centimes restants entre les passagers, au lieu de perdre un centime au total. Les valeurs de distance (100 000 km maximum), consommation (100 L/100 km maximum), prix (100 €/L maximum) et nombre de passagers (1 à 100) sont bornées pour garantir des calculs exploitables. Les résultats ne couvrent que le carburant, pas les péages, le stationnement ou l'usure.


## Améliorations v2
- Aperçu instantané du coût, des litres, de la distance et de la répartition.
- Aller simple ou aller-retour ; aller-retour double la distance et le carburant uniquement.
- Péages et stationnement optionnels, saisis pour l'ensemble du déplacement.
- Export CSV et sauvegardes JSON v1 compatibles.
- Le champ « personnes » inclut explicitement le conducteur.
