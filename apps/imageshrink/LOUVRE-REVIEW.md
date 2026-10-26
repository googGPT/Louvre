# ImageShrink — audit initial, architecture et provenance Louvre

## Identité de la mission

- **Numéro global :** application 24 de Louvre ; **vague 2 :** numéro 04/20.
- **Source du besoin :** `LOUVRE-WAVE2-TRACKER.md`, ligne « 04 | ImageShrink | Compression locale d’images | ReceiptRescue (photos accessoires) | redimensionnement et qualité image ».
- **Audit initial :** avant cette intervention, aucune application `apps/imageshrink`, aucune branche dédiée ni Pull Request ImageShrink n'existaient dans le dépôt. Il était donc impossible de vérifier ou de corriger une version antérieure.
- **Solution :** création initiale d'une application autonome sécurisée de redimensionnement et de conversion d'images, sans API distante ni dépendance payante.

## Architecture et choix métiers

`core.js` contient les fonctions pures de validation des types MIME, du nombre de fichiers, des paramètres, dimensions maximales, noms de sortie et économies effectives. `app.js` contrôle le navigateur, les conversions par Canvas, les aperçus, les ressources et les téléchargements. `index.html` apporte une interface sémantique ; `style.css` est réactif ; `sw.js` met en cache seulement la coquille statique. Les `tests/` distinguent assertions de domaine et vrais parcours navigateur Chromium.

Le traitement suit le contrat : vérifier MIME/taille du fichier → décoder → valider pixels/dimensions → conserver proportions → réencoder au format choisi → contrôler le MIME de sortie → annoncer les tailles réelles → créer une URL `blob:` téléchargeable. Les conversions sont **séquentielles** et les images ne sont ni persistées, ni envoyées sur le réseau. Le code évite `innerHTML` avec les noms de fichiers fournis par l'utilisateur et normalise les noms des téléchargements.

## Cinq références de la bibliothèque technique du dépôt (fiches lues)

1. **TS16-001**, `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials*, chapitre 16, pages physiques PDF documentées **396–400**. Principe **rapporté par la fiche** : valider les données inconnues avant de supposer un contrat fiable. **Adaptation originale :** `validFile`, `settings` et `validateBatch` rejettent les valeurs hors des bornes, formats non pris en charge, tailles invalides et injections de champs.
2. **FULL08-001**, `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer* (2024), chapitre 8, pages PDF **160–174**. Principe rapporté : scénarios positifs, limites et erreurs avec validations reproductibles. Adaptation : cas Node sur dimensions, limites, formats et métriques, complétés par vrais tests Canvas.
3. **NEXT10-001**, `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications* (2026), chapitre 10, pages PDF **248–263**. Principe rapporté : tests de composants/comportements et validation de bout en bout distinctes. Adaptation **sans utiliser Next.js** : test Python/Playwright dans Chromium qui produit réellement WebP/JPEG/PNG et vérifie les pixels de transparence.
4. **VUE02-001**, `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3* (2024), chapitre 2, pages PDF **40–47**. Principe rapporté : source unique d'état et calcul des vues dérivées. Adaptation **sans utiliser Vue** : une liste de fichiers de la session, résultats dérivés dans le DOM ; aucun stockage local des photos.
5. **GHA09-001**, `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions* (2023), chapitre 9, pages PDF **210–220**. Principe rapporté : permissions minimales et méfiance à l'égard des entrées non fiables. Adaptation : CI `contents: read`, scripts exécutés à partir du dépôt et fichiers soumis jamais interpolés dans une commande shell.

Ces références sont **des lectures de fiches existantes**, et non une relecture des PDF originaux dans cette mission. Aucune affirmation ne prétend qu'un livre présente cet algorithme de compression ni les API précises employées.

## Recommandations techniques externes (non attribuées aux livres)

- `HTMLCanvasElement.toBlob` : encoder selon format et qualité souhaités ; vérifier le `Blob.type` réellement retourné car certains navigateurs reviennent à PNG lorsqu'ils ne prennent pas en charge le format demandé.
- `createImageBitmap` : décodage natif de fichiers image ; usage optionnel d'un fallback `HTMLImageElement` si la fonction n'est pas disponible.
- `URL.createObjectURL` / `revokeObjectURL` : prévisualiser/télécharger et nettoyer les URLs de session.
- `Service Worker` : conserver uniquement le code statique dans le cache ; jamais les photos ni `blob:`.
- Documentation navigateur : https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob ; https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap

## Limites et risques résiduels

- La prise en charge réelle de WebP dépend du navigateur ; le format n'est **jamais substitué silencieusement**.
- Une limite de taille du fichier ne contrôle pas le coût de décodage ; les restrictions de pixels s'appliquent **après** le décodage, pouvant néanmoins causer des pics de mémoire sur une image compressée anormalement grande.
- Les changements d'orientation EXIF, de couleur ICC, d'animations ou de transparence selon le format peuvent modifier le rendu. JPEG place un fond blanc. La réécriture n'assure ni suppression de métadonnées vérifiable ni effacement sûr des originaux.
- Le pourcentage d'économie repose sur les octets réels ; une image recompressée peut être plus volumineuse que l'original. Les dimensions arrondies à des pixels entiers peuvent donner un écart mineur de ratio pour de très petites tailles.
- Le cache de la coquille exige une première navigation en ligne ; la prise en charge des téléchargements multiples dépend des politiques du navigateur, donc les téléchargements sont proposés individuellement.

## Vérifications à effectuer avant fusion

- `node --check` sur core/app/service worker ; manifeste JSON analysable et copies HTML identiques ;
- `node --test apps/imageshrink/tests/core.test.cjs` (bornes, noms, limites, tailles, calculs) ;
- `python apps/imageshrink/tests/browser.test.py` (encodage/lecture vrais formats, canal alpha, téléchargement, rejets, mobile, hors ligne) ;
- statut des workflows du **dernier commit** sur la Pull Request, et intégrité documentaire Louvre ;
- aucune modification d'applications historiques ni fusion automatique dans `main`.
