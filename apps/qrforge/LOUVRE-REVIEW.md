# QRForge — audit et provenance Louvre

## Vérification du périmètre

- **Application globale n° 25 = vague 2 n° 05/20**, nom exact **QRForge**, d'après `LOUVRE-WAVE2-TRACKER.md`.
- L'application **n'était pas développée** au début de la mission : absence du répertoire et absence de PR/branche dédiée. Cette PR réalise une application nouvelle au lieu de présenter une correction fictive.
- Produit original : générateur QR local, distinct des applications Louvre déjà existantes.

## Conception

`vendor/qrcode.js` fournit l'encodage QR Model 2 1–40, ECC L/M/Q/H et la sélection de masque. Il provient de Kazuhiko Arase, **MIT**, avec licence intégrale conservée. C'est la source de l'algorithme QR, indépendamment de la bibliothèque Louvre. Aucun logiciel installé en arrière-plan ni dépendance distante au lancement de l'application.

`core.js` valide données/types/URL, échappe le format Wi-Fi, impose une marge de silence, des couleurs sombres sur fond clair et le calcul SVG/Canvas à partir des modules noirs fournis par la bibliothèque.

`app.js` tient un état éphémère sans sauvegarde, valide avant de montrer le résultat, détruit l'ancienne URL `blob:` à chaque changement, désactive l'export d'un résultat périmé, encode sur place PNG et fournit des messages d'erreur explicites.

Le service worker n'enregistre **que la coquille statique**. Aucune donnée de QR, mot de passe ou URL utilisateur dans des caches applicatifs.

## Cinq fiches de références étudiées et adaptations

1. **TS16-001**, `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials*, chapitre 16, pages PDF physiques **396–400** *rapportées par la fiche*. Principe : vérifications concrètes des valeurs inconnues. Adaptation : contrôles de longueur en octets UTF-8, URL, couleurs HEX, clés Wi-Fi et seuils.
2. **FULL08-001**, `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer*, chapitre 8, pages PDF **160–174** *rapportées*. Principe : tests d'exigences, cas limites, doubles. Adaptation : batterie Node pure et cas négatifs (injection URL, Wi-Fi, ECC, contraste, taille) sans naviguer dans un navigateur.
3. **NEXT10-001**, `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications*, chapitre 10, pages PDF **248–263** *rapportées*. Principe : tests d'intégration indépendants. Adaptation **sans Next.js** : production Chromium puis décodage externe avec ZXing-C++ ; contrôle mobile et hors ligne.
4. **VUE02-001**, `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3*, chapitre 2, pages PDF **40–47** *rapportées*. Principe : état unique et vues dérivées. Adaptation **sans Vue** : `result` unique, prévisualisation et export désactivés si invalides, aucune persistence.
5. **GHA09-001**, `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions*, chapitre 9, pages PDF **210–220** *rapportées*. Principe : permissions CI minimales et séparation entrées non fiables. Adaptation : `contents:read`, QR de tests synthétiques, sans secrets.

**Provenance :** seules les fiches présentes dans le dépôt ont été ouvertes ici ; les pages citées sont les pages *rapportées par ces fiches*. Aucune relecture des PDF d'origine n'est prétendue. Les règles de QR et la dépendance open source ne sont pas attribuées aux ouvrages.

## Vérifications attendues

Workflow `.github/workflows/louvre-wave2-qrforge-qa.yml` : syntaxe JS, manifeste JSON, HTML identiques, tests métier Node, tests navigateur Chromium, décodeur **indépendant** `zxing-cpp`, vérification des données extraites, scénario Wi-Fi, export vectoriel SVG, PNG, mobile et PWA.

Résultats : indiquer uniquement la CI du **SHA final**, une fois les journaux consultés.

## Risques résiduels et limites

- La compatibilité sans ECI des caractères UTF-8 doit être testée avec des lecteurs de QR différents ; le QR Wi-Fi est un format de facto et sa prise en charge varie.
- Le code QR n'est pas une sécurité et expose les secrets encodés.
- Certains lecteurs ou appareils n'acceptent pas des URL/URI même correctement encodées ; aucun test ne garantit toute la population d'appareils.
- Correction d'erreurs élevée ne garantit pas la lecture sous occultation, manipulation ou impression.
- Le contraste ≥ 4,5:1 n'est pas une certification QR, simplement un garde-fou volontaire.
- Pas de changement d'application ancienne ni de `main`.
