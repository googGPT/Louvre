# SizeMatch v2 — unités et conversions quotidiennes

Application statique sans inscription, sans API et sans clé. Conversion instantanée de **distance, masse, volume américain et température**. Peut fonctionner hors ligne après le premier chargement.

## Fonctions

- 19 unités identifiées explicitement : distance (km, mile, m, ft, cm, mm, in, yd), masse (kg, lb, g, oz), volume (L, mL, gallon US, once liquide US), température (°C, °F, K).
- Températures négatives permises, mais températures inférieures au zéro absolu refusées ; unités de catégories différentes refusées.
- Affichage lisible à **neuf chiffres significatifs** ; les valeurs sous-jacentes ne sont pas tronquées à trois décimales. Les flottants JS restent des approximations binaires.
- Inversion des unités, résultats instantanés, modèles de test, copie de résultat.
- Historique local : création/édition/suppression/recherche/filtres, export CSV sécurisé contre interprétation de formules, sauvegarde/restauration JSON validées.
- Compatibilité avec JSON v1 et avec la clé historique `louvre-factory:sizematch:v1` ; aucun effacement automatique.

## Exécution et tests

Servir ce dossier via un serveur statique HTTP, puis ouvrir `index.html` ; sur GitHub Pages après **fusion** de la PR. `node --test tests/core.test.cjs` et `python tests/browser.test.py` (Playwright Chromium).

## Limites

Sans changement de monnaie ni taux de change, dimensions physiques seulement. Les unités de volume « US » sont **américaines**, pas impériales. Les résultats affichés sont arrondis et ne constituent ni une mesure certifiée ni une conversion légale. Le profil de navigateur conserve les données : export JSON nécessaire pour restaurer les fiches. Pas de synchronisation ni de partage des données avec un serveur.