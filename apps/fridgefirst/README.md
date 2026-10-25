# FridgeFirst Web v1 — Louvre, gratuit et local

FridgeFirst est le quatrième produit Web du portefeuille Louvre : un inventaire anti-gaspillage au quotidien et un catalogue de 15 idées de recettes classées par ingrédients disponibles et échéances saisies.

## Utilisation

1. Ouvrir `https://googgpt.github.io/Louvre/apps/fridgefirst/` **après fusion et déploiement de la PR**.
2. Ajouter chaque aliment avec sa quantité, sa catégorie, son rangement et **la date indiquée sur l'emballage**.
3. L'onglet **Mon inventaire** trie les produits par date et propose d'en déclarer la consommation ou la mise au rebut.
4. L'onglet **Idées de recettes** classe les recettes selon la part d'ingrédients disponibles et la proximité de leurs dates, sans appeler de services externes. Ouvrir « Voir la préparation » pour les étapes. Ajouter les ingrédients manquants dans la liste de courses.
5. **Sauvegarder** régulièrement un JSON et le conserver en lieu sûr. **Restaurer** vérifie les données puis sollicite votre confirmation avant tout remplacement.

## Architecture, coût et vie privée

- 100 % HTML/CSS/JavaScript. Aucun framework, compilateur, serveur, compte, tracking ni API tiers à l'exécution.
- `core.js` expose les règles métier testables (dates, correspondance des ingrédients, recettes, import validé).
- `app.js` rend l'interface et persiste **une unique version d'état** dans `localStorage`, pas de base distante.
- `sw.js`, `manifest.webmanifest`, `icon.svg` servent une application Web progressive (PWA) accessible hors ligne **après premier chargement réussi en ligne**. L'installation dépend du navigateur ; aucune application native iOS/Android n'est revendiquée.
- Coût additionnel requis : **0 €**. GitHub Pages/Actions suivent les quotas, politiques et limites du compte et de la plateforme ; les téléchargements de tests dans la CI ne sont pas des API commerciales d'exécution.
- Sauvegardes JSON structurées en version 1 : `items`, `history`, `shopping`. Aucune photo/scan ni OCR dans cette version.

## Contraintes alimentaires : sécurité et honnêteté

Une date dépassée ne suffit ni à déclarer un produit dangereux ni à le déclarer consommable. La différence **DLC** / **DDM** et le respect des instructions de conservation, de cuisson et de la chaîne du froid sont primordiaux. FridgeFirst affiche « date dépassée », **exclut par prudence** ces produits de son moteur de suggestions et laisse à la personne la décision de consommer ou de jeter : ce n'est **pas une expertise de sécurité alimentaire**.

Les 15 recettes sont des propositions simples à confirmer, pas un conseil nutritionnel ou allergène : recettes et algorithme ne vérifient pas portions suffisantes, allergies, présence d'ingrédients accessoires, salubrité, températures ou durées précises de cuisson. La quantité disponible n'est pas normalisée entre « g » et « pièce » ; la disponibilité d'un ingrédient signifie seulement que l'utilisateur en a déclaré une quantité positive.

Les nombres de produits consommés/jetés sont **déclaratifs**, non un calcul d'euros, de CO2 ou de kilos sauvés. Pas de notifications quand l'app est fermée, de base alimentaire en temps réel, de synchronisation inter-appareils, ni de fonctionnalités génératives prétendument gratuites.

## Vérifications

```sh
node --check apps/fridgefirst/core.js
node --check apps/fridgefirst/app.js
node --check apps/fridgefirst/sw.js
node --test apps/fridgefirst/tests/core.test.cjs
python apps/fridgefirst/tests/browser.test.py
```

Le test navigateur utilise Chromium/Playwright présents dans l'environnement CI (installés uniquement pour le test), et éprouve le scénario réel : CRUD, urgences, recettes, courses, bilan, export/import et PWA hors ligne sur écran mobile 390 px. Le projet ne charge pas Playwright chez les utilisateurs.

La page de traçabilité détaillée est [LOUVRE-REVIEW.md](LOUVRE-REVIEW.md).