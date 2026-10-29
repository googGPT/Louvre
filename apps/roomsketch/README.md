# RoomSketch — Louvre application n° 30 (vague 2, 10/20)

## État initial

Le registre officiel `LOUVRE-WAVE2-TRACKER.md` désignait **RoomSketch** comme une piste « plan de pièce à échelle », relevant de la « géométrie 2D, zones de collision », sans développement. L'audit GitHub du 27 octobre 2026 n'a trouvé ni `apps/roomsketch`, ni branche dédiée, ni Pull Request. Il s'agit donc de **l'implémentation initiale** de l'application, pas de la réparation d'un logiciel antérieur.

## Mode d'emploi

RoomSketch permet de créer une **pièce rectangulaire** dont la largeur et la profondeur intérieures sont définies en **centimètres entiers**, de **200 à 1 500 cm** chacune. L'interface montre la pièce dans un SVG où **une unité du `viewBox` vaut un centimètre**. La grille visuelle marque tous les **50 cm** ; le magnétisme des déplacements est activé par défaut à **10 cm**.

1. Renseignez la largeur et la profondeur puis appliquez les dimensions. Le redimensionnement est **refusé** si un meuble existant deviendrait hors des limites.
2. Ajoutez des meubles prédéfinis : table 120 × 70, lit 200 × 160, canapé 210 × 90, bureau 140 × 70, chaise 50 × 50, armoire 120 × 60 ou meuble libre 80 × 60 (toutes les dimensions en cm). Un emplacement valide est recherché automatiquement dans l'ordre des cellules de 10 cm ; si la grille ne trouve rien, une seconde recherche essaie les positions exactes au contact des bords des meubles existants. Si aucun emplacement ne convient, l'ajout est refusé.
3. Cliquez ou touchez un meuble, puis faites-le glisser ; utilisez les flèches pour le déplacer par pas de 10 cm, ou **Maj + flèche** pour 1 cm, et **R** pour le tourner de 90°. Vous pouvez aussi choisir un meuble dans la liste et saisir exactement ses coordonnées X/Y, sa taille et son libellé.
4. Consultez la surface de la pièce, les surfaces occupée et libre. Exportez **SVG** pour une image vectorielle réutilisable ou **JSON** pour une sauvegarde éditable ; « Imprimer » utilise la boîte du navigateur, sans promettre une impression physique à l'échelle 1:50.
5. La sauvegarde est réalisée localement dans le navigateur, sans serveur. Utilisez « Restaurer JSON » pour reprendre un plan, après confirmation de remplacement.

## Géométrie et exactitude

`core.js` traite les coordonnées, tailles et orientations en **centimètres entiers**. Les meubles sont des **rectangles orthogonaux** et leur rotation est limitée à **0° ou 90°** ; les dimensions occupées sont inversées à 90°. Deux meubles sont déclarés en collision **uniquement si leurs rectangles ont une intersection de surface strictement positive**. Le simple contact de bord ou de coin est autorisé. Les limites de la pièce interdisent tout dépassement. Chaque édition, placement, import ou rotation est rejeté en cas de collision ou de sortie de pièce. Le système n'effectue **pas de troncature, de repositionnement silencieux ni de résolution automatique des conflits**.

La surface occupée est la **somme des surfaces au sol des rectangles** ; comme les recouvrements sont exclus, la surface libre affichée est la surface de la pièce moins cette somme. Ce calcul n'est **pas** une zone de circulation réelle : il ne prend pas en compte les portes et fenêtres, l'ouverture des placards, les dégagements de sécurité, les poteaux, l'épaisseur des murs, les allées de passage ou les hauteurs. L'application ne gère pas non plus les pièces non rectangulaires, les angles libres, les murs porteurs ou la modélisation 3D.

**Bornes vérifiées par le modèle :** dimensions pièce 200–1 500 cm ; meubles 20–600 cm en largeur/profondeur ; jusqu'à **60 meubles** ; schéma JSON version **1** strict (clés, identifiants et valeurs validés) ; taille maximale JSON **500 000 octets UTF-8**. L'export SVG utilise un `viewBox` en coordonnées centimétriques, et une image de largeur 1 000 unités de rendu avec hauteur proportionnelle. L'export **respecte les proportions**, mais son impression physique dépend du logiciel, du zoom et de l'imprimante ; **aucune échelle papier certifiée** n'est garantie.

## Confidentialité et robustesse

Aucun compte, API payante, backend, CDN ni synchronisation distante n'est ajouté. Les plans sont enregistrés en clair dans `localStorage` du navigateur : ce stockage peut être lu par toute personne ayant accès au même profil navigateur ou supprimé par les paramètres de confidentialité. L'app ne prétend pas à un chiffrement ou à un archivage pérenne. Les exports SVG/JSON sont des téléchargements locaux par Blob.

Les nouvelles versions du plan sont validées **avant l'écriture** et l'état affiché n'est modifié définitivement qu'après succès de `localStorage.setItem`. En cas d'erreur de quota, l'état précédent est conservé. En cas de JSON corrompu, l'application verrouille les modifications, permet la copie brute, et n'autorise le retour en édition qu'après import validé et écrit avec succès. Un événement de modification du stockage par un autre onglet déclenche une actualisation ou un verrouillage de sécurité. Ces mécanismes ne sont **pas une transaction inter-onglets atomique parfaite**.

Le plan HTML est construit par des nœuds SVG avec `textContent` ; l'export SVG est généré depuis un modèle validé et échappe les caractères XML sensibles. Les noms de meubles ne sont jamais injectés comme HTML exécutable.

La PWA ne met en cache que les ressources statiques de l'application (aucun plan utilisateur ni téléchargement) et propose le hors ligne **après un premier chargement réussi**, sous réserve du navigateur.

## Tests

```bash
node --check apps/roomsketch/core.js
node --check apps/roomsketch/app.js
node --check apps/roomsketch/sw.js
node --test apps/roomsketch/tests/core.test.cjs
python apps/roomsketch/tests/browser.test.py
```

Les tests Node vérifient les bornes, les chevauchements, le contact des bords, l'orientation 90°, les positions, l'aire, les limites, les collisions, la sérialisation JSON et l'échappement SVG. Les tests Chromium vérifient la grille métrique, la manipulation réelle de meubles, le clavier, les téléchargements SVG analysés en XML/JSON, le XSS, la persistance, les corruptions de sauvegardes, les erreurs de quota, l'impression et le mode hors ligne sur un écran **390 px**.

Les tests ne peuvent être déclarés réussis qu'après inspection des checks **au commit final**.

## Bibliothèque Louvre

Les références consultées dans `LOUVRE-REVIEW.md` sont les fiches TS16-001, FULL08-001, NEXT10-001, VUE02-001 et GHA09-001. Ces documents du dépôt rapportent des lectures précédentes des ouvrages. L'algorithme de géométrie, les contrôles et le SVG sont **des adaptations originales** ; cette intervention ne revendique pas une nouvelle lecture des PDF sources.

## Intégration GitHub

Branche : `codex/louvre-wave2-10-roomsketch`. L'application figure déjà parmi les slugs optionnels de déploiement dans `.github/workflows/deploy-moneyuntil-pages.yml`. Son déploiement est donc possible après **fusion autorisée** dans `main` ; aucune modification directe de `main` ni fusion automatique.
