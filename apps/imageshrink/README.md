# ImageShrink — Louvre application n° 24 (vague 2, 04/20)

**Statut initial de l'audit :** l'application n'existait pas dans le dépôt `googGPT/Louvre`. Le registre `LOUVRE-WAVE2-TRACKER.md` identifiait seulement la **piste n° 04 ImageShrink** (« Compression locale d’images »). Cette branche propose donc une **première application réellement utilisable**, et non la correction d'un logiciel antérieur.

## Objectif et périmètre

Optimiser **sur l'appareil** des images JPEG, PNG ou WebP, sans accès à un service distant et sans coût d'API.

- Importer 1 à 10 fichiers de **maximum 20 Mio chacun** et **60 Mio par lot**.
- Choisir le format de sortie : **WebP, JPEG ou PNG**. Qualité entre **30 % et 95 %** pour JPEG et WebP ; le réglage ne s'applique pas à PNG.
- Fixer la largeur et la hauteur maximales entre 64 et 6 000 pixels ; pas d'agrandissement ni de déformation. Décodage de **40 mégapixels maximum**, encodage de **20 mégapixels maximum**.
- Visualiser les aperçus d'entrée/sortie, leurs dimensions, tailles réelles, ratio d'économie et le bouton de téléchargement individuel.
- Annuler le traitement en cours ou retirer tous les fichiers. Le traitement est **séquentiel** pour ne pas décoder tout le lot en parallèle.
- Fonctionner hors ligne après première visite en ligne réussie, navigateur compatible et installation de la coquille PWA.

## Confidentialité et sécurité

Aucune photo n'est téléchargée vers un serveur ni vers une API. Le traitement se déroule dans le navigateur via **Canvas, `createImageBitmap` et `canvas.toBlob`**, puis téléchargement depuis des URLs locales `blob:`. Le service worker met en cache **uniquement des fichiers statiques**, jamais des images utilisateur. Les fichiers, leurs aperçus et résultats demeurent en mémoire pendant la session ; les URLs `blob:` sont libérées au remplacement, à l'annulation ou au départ de page. Aucune image, préférence ou résultat n'est enregistré dans `localStorage`.

Les fichiers **SVG, GIF, HEIC, PDF et autres types** sont refusés ; les types autorisés ne sont pas automatiquement fiables : un contenu annoncé image/png mais illisible est rejeté au décodage. Les limites de taille sont vérifiées avant le décodage ; des images excessivement volumineuses ou corrompues peuvent néanmoins affecter les ressources du navigateur, car la décompression précède la vérification des dimensions.

**Limites de confidentialité :** le navigateur et le système d'exploitation restent responsables de la gestion de la mémoire et des téléchargements locaux ; ImageShrink ne garantit ni effacement sécurisé du disque ni suppression de toute métadonnée. Les images réencodées peuvent perdre leur EXIF, ICC, GPS, animations, propriétés HDR ou profil de couleur.

## Règles de conversion

- **Aspect ratio** maintenu en ajustant l'image dans la zone `maxWidth × maxHeight` sans agrandissement.
- **JPEG** n'a pas de transparence : un fond **blanc** est peint avant le dessin de l'image. PNG/WebP conservent la transparence si l'encodeur du navigateur la gère.
- WebP et JPEG utilisent les réglages de qualité de `toBlob`, qui sont **indicatifs** et peuvent varier entre navigateurs ; PNG est réencodé sans le réglage de qualité.
- **Aucune réduction de poids n'est garantie.** Si le résultat est plus lourd, l'interface affiche une augmentation explicite. Aucune conversion cachée en un autre MIME n'est acceptée.
- Les fichiers d'entrée ne sont **jamais écrasés**. Le nom de sortie est `original-imageshrink.webp`, `.jpg` ou `.png` selon le format réel.

## Vérifier

```sh
node --check apps/imageshrink/core.js
node --check apps/imageshrink/app.js
node --check apps/imageshrink/sw.js
node --test apps/imageshrink/tests/core.test.cjs
python apps/imageshrink/tests/browser.test.py
```

Le test navigateur utilise Chromium et Playwright. Il valide de **véritables conversions** générées depuis un Canvas de démonstration : dimensions, sortie WebP téléchargeable, suppression de la transparence JPEG, conservation de l'alpha PNG, traitement de deux images, fichiers rejetés, stockage inexistant, mobile 390 px et PWA hors ligne.

**La présence des tests ne prouve pas leur succès** : seul le résultat du dernier workflow GitHub Actions fait foi.

## Hébergement et évolutivité

La PR ajoute `apps/imageshrink` sans écraser les 23 premiers produits. Le workflow existant `.github/workflows/deploy-moneyuntil-pages.yml` prévoit déjà l'intégration **additive** des applications vague 2, y compris `imageshrink`, après leur fusion et après la réussite de ses contrôles. Les quotas GitHub Pages/Actions restent applicables. Ne rien fusionner automatiquement dans `main`.

## Provenance Louvre

Cinq fiches de la bibliothèque du dépôt sont consultées, en respectant leurs limites et les pages PDF *rapportées dans les fiches* : TS16-001, FULL08-001, NEXT10-001, VUE02-001 et GHA09-001. Les règles de traitement d'image et le code de cette application sont des **adaptations originales**, sans prétendre provenir des livres, ni certifier des versions de navigateurs non testées.
