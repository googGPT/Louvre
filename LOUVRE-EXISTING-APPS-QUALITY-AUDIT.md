# Louvre — Audit transversal de fiabilité des applications existantes

**Périmètre :** dépôt `googGPT/Louvre`, branche `main`, inventaire inspecté le 27 octobre 2026. Cette passe vise **les erreurs de validation commune observées et les protections d'import**, pas une réécriture aveugle de chaque application.

## Inventaire réellement vérifié

- **32 applications** détectées dans `apps/` au niveau du commit `main` audité.
- **31** ont une structure multi-fichiers comprenant `index.html`, `core.js`, `app.js`, `style.css`, `sw.js` et `manifest.webmanifest`.
- **MoneyUntil** est volontairement conçu en HTML autonome avec CSS et JS intégrés ; il ne faut **pas** considérer l'absence d'un `core.js` séparé comme une erreur. Il dispose déjà de tests Node, mais **pas initialement de test Chromium dédié**.
- Les **32** disposent de tests métier Node selon les conventions existantes ; les **31** autres applications disposaient déjà d'un parcours navigateur. Cette PR ajoute un parcours navigateur à MoneyUntil.
- Les applications réellement disponibles en `main` sont : chorewheel, citationcraft, colorcontrast, csvclinic, decisiondeck, eventcount, findmystuff, focusforge, fridgefirst, fuelmath, goalladder, gradepilot, homepulse, imageshrink, invoicecanvas, mileagebook, moneyuntil, parkwise, qrforge, quizcraft, readtrail, receiptrescue, roomsketch, roundplan, shiftledger, sizematch, snapaction, splitfair, textdiff, travelday, trippack, worldmeet.
- D'autres branches et PR ouvertes existent : leur contenu **ne doit pas être supposé fusionné** dans `main`.

## Deux défauts observés dans GitHub Actions

### 1. QuizCraft : assertion asynchrone et import concurrent

Le workflow `40422239465` (sur `main`) a échoué dans `apps/quizcraft/tests/browser.test.py`, ligne 107 initiale, parce qu'il contrôlait le texte « Import refusé » immédiatement après `set_input_files`. Le gestionnaire réel utilise `await file.text()` : l'assertion pouvait se produire **avant** la fin du traitement.

**Correction :** Playwright utilise `expect(...).to_contain_text`, ce qui attend le résultat visible. Le gestionnaire d'import mémorise aussi l'état du stockage avant la lecture, puis compare avant remplacement : si l'utilisateur a édité sa bibliothèque pendant un chargement lent, l'import **refuse d'écraser les données plus récentes**. Un scénario navigateur force volontairement une lecture différée et contrôle ce refus.

### 2. DecisionDeck et autres interfaces modernisées : publication rejetée par ancien nom de marque

Le workflow `40419004391` avait réussi ses tests métier, puis échoué pendant le **smoke test des pages publiques**. Ce script exigeait littéralement `Louvre App Factory`. L'inspection de `apps/decisiondeck/index.html` montre le titre actuel `DecisionDeck — Comparateur multicritère` sans cette chaîne. Un grand nombre d'autres applications avaient également retiré ce branding ; le test n'était donc plus adapté à leurs nouvelles interfaces.

**Correction :** `scripts/verify_public_app.py` reconnaît l'application à partir de son `<title>` contenant le slug normalisé et de la présence d'un script `core.js`, puis contrôle le fichier JavaScript téléchargé (non vide, non remplacé par du HTML). Il n'exige ni la marque historique, ni la présence de `<main>` (certaines pages valides n'utilisent pas cet élément). Les tests unitaires incluent interfaces anciennes et nouvelles, page d'une autre application, JavaScript remplacé par une page d'erreur et HTML malformé.

Le même validateur vérifie **toutes les applications multi-fichiers réellement présentes** lors de l'étape de test locale. Il est réutilisé lors des smoke tests **des applications publiées** (Factory et vague 2). Il vérifie l'identité des fichiers, pas l'ensemble des performances ni de la conformité de l'application.

## Amélioration de la couverture MoneyUntil

Un parcours Chromium a été ajouté pour vérifier l'ouverture initiale des paramètres, la configuration d'un budget, l'ajout d'une dépense, une facture à venir, un scénario hypothétique ne créant pas de dépense, le rechargement de la page et l'export/restauration JSON. L'écran utilisé est de **390 pixels**. MoneyUntil demeure une application **HTML autonome** sans service worker ; contrairement aux PWA de Louvre, **son fonctionnement hors ligne après première visite n'est pas certifié** par ce test.

## Garanties et limites de cette passe

- Branche de travail indépendante ; aucun merge automatique et aucune modification directe de `main`.
- Tests Node historiques et navigateur de chaque application toujours exécutés par le workflow commun ; nouvelles vérifications ajoutées sans supprimer les contrôles métier existants.
- L'audit **ne constitue pas une revue de code complète ligne par ligne des 32 applications**, ni un pentest, ni un test de charge, ni un audit de toutes les obligations RGPD. Il n'affirme pas avoir mesuré les performances réseau individuelles ou la compatibilité de tous les appareils.
- Les protections de cohérence des imports et de navigateur utilisées ici ne garantissent pas des transactions multi-onglets strictement atomiques.
- Les résultats réels de cette PR doivent être vérifiés au **dernier commit** dans GitHub Actions. Un test écrit n'est pas nécessairement un test réussi.

## Priorités recommandées après cette passe

**P1 — fiabilité commune :** confirmer les checks complets de `main` après merge autorisé ; consolider la publication Pages avec un smoke test de toutes les URLs sans attentes de branding.

**P2 — robustesse applicative :** examiner les flux asynchrones d'import/export des autres applications, ainsi que les erreurs de quota de stockage, les sauvegardes corrompues et le risque d'écrasement entre onglets. Éviter les modifications en bloc sans scénarios de régression précis.

**P3 — performance et accessibilité :** mesurer temps de chargement, taille CSS/JS, navigation clavier, contraste et mobile sur les pages réellement déployées, puis optimiser individuellement les cas mesurés et justifiés.

## Références de conception (fiches Louvre, pas lectures nouvelles de PDF)

- `TS16-001` — contrôles honnêtes des entrées ; `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`.
- `FULL08-001` — tests dirigés par les cas limites ; `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`.
- `NEXT10-001` — tests UI/intégration réalistes ; `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`.
- `VUE02-001` — états dérivés et stockage local ; `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`.
- `GHA09-001` — permissions minimales et entrées non fiables ; `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`.

Les cinq fiches ont été consultées dans le dépôt. Le script de validation des pages et les modifications d'application sont des adaptations originales, **non attribuées aux auteurs des ouvrages**.
