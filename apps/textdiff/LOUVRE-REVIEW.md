# TextDiff — audit et traçabilité technique Louvre

## Constat initial

**Application globale n° 27 / vague 2 n° 07/20.** Le registre `LOUVRE-WAVE2-TRACKER.md` présentait la fonctionnalité « comparaison textuelle » et l'algorithme « LCS et alignement de modifications », classée comme piste non développée. Les vérifications GitHub n'ont trouvé aucun dossier `apps/textdiff`, branche dédiée ou PR antérieure. La présente intervention **construit** une première application plutôt que de corriger un système préexistant.

## Architecture

- `core.js` : validateur des options/sources, normalisation des fins de ligne, découpage en unités, algorithme LCS déterministe et construction du rapport texte.
- `app.js` : adaptation DOM, rendu via `textContent` au lieu de HTML injecté, suivi de la révision de l'état, upload local, copie, téléchargement local.
- `index.html` et `index.htm` : formulaires accessibles, contrôle des options, table des différences ou deux panneaux de mots, statistiques et erreurs.
- `style.css` : design mobile accessible ; `sw.js` : cache statique offline uniquement ; `manifest.webmanifest` : PWA.
- `tests/core.test.cjs` : vérification indépendante de la logique ; `tests/browser.test.py` : véritables parcours Chromium avec export, mobile et PWA.

## Propriétés et limites

LCS par programmation dynamique O(n×m) avec matrice `Uint16Array`, bornée avant allocation à 700 unités par version. La borne de 60 000 unités UTF-16 protège les entrées volumineuses. Les comptes satisfont `identiques + supprimées = avant` et `identiques + ajoutées = après`. La similarité LCS n'est pas une distance sémantique ; des répétitions peuvent admettre plusieurs alignements optimaux. Les modes ignorer casse/espaces définissent une équivalence de comparaison sans remplacer les textes originaux ; les deux côtés sont affichés dans leur graphie exacte et le rapport distingue les différences ignorées.

Le TXT exporté est un **rapport inspectable** avec chaînes représentées en JSON, non un patch Git prêt à appliquer. En mode mots, les blancs sont des unités de comparaison, explicitement annoncées. La sélection de texte n'est jamais persistée. Les échecs de validation sont explicites, sans troncature silencieuse, et les exports obsolètes sont immédiatement invalidés.

## Bibliothèque Louvre : cinq fiches réellement consultées

1. **TS16-001** — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials*, chapitre 16, pages PDF physiques **396–400**, selon la fiche du dépôt. **Principe rapporté :** vérifier les champs inconnus avant de conclure à un type valide. **Adaptation originale :** validation strictement typée des options, sources et modes et bornes mémoire.
2. **FULL08-001** — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer* (2024), chapitre 8, pages PDF **160–174**, selon la fiche. **Principe rapporté :** scénarios de test métier, limites et dépendances isolées. **Adaptation originale :** assertions Node pour index, LCS, options, données adverses et rapport ; tests d'intégration distincts.
3. **NEXT10-001** — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications*, chapitre 10, pages PDF **248–263**, selon la fiche. **Principe rapporté :** séparer tests des composants et intégration réaliste. **Adaptation originale sans Next.js :** Playwright vérifie le rendu, les téléchargements, les sources modifiées et le fonctionnement hors ligne.
4. **VUE02-001** — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3*, chapitre 2, pages PDF **40–47**, selon la fiche. **Principe rapporté :** source unique d'état et interface dérivée. **Adaptation originale sans Vue :** un résultat courant révocable et une révision incrémentale ; pas de stockage local des textes.
5. **GHA09-001** — `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions* (2023), chapitre 9, pages PDF **210–220**, selon la fiche. **Principe rapporté :** permissions minimales et entrée non fiable. **Adaptation originale :** CI `contents: read`, absence d'interpolation du texte utilisateur dans les commandes, rendu par `textContent`.

Les pages ci-dessus proviennent de la **lecture des fiches existantes** du dépôt. Aucun livre PDF original n'a été ouvert pendant cette mission ; le code LCS, l'interface et les règles sont des **travaux originaux Louvre**, non attribués aux auteurs.

## Vérifications nécessaires

- `node --check` sur les trois scripts ;
- `node --test apps/textdiff/tests/core.test.cjs` ;
- manifeste JSON parsable et identité exacte des deux variantes HTML ;
- `python apps/textdiff/tests/browser.test.py`, Chromium réel ;
- intégrité documentaire Louvre et éventuels autres checks sur le HEAD final.

Ne pas présenter la présence des tests comme leur succès avant consultation des journaux du dernier SHA. Ne pas fusionner automatiquement `main`.

## Contraintes résiduelles

- Limitations de 700 unités : un gros texte doit être comparé en extraits ; algorithme exact dans les limites, aucune génération silencieuse de diff approximatif.
- Le format Unicode est traité en chaînes JS ; `toLowerCase()` n'assure pas une équivalence linguistique universelle (p. ex. casse locale complexe) ni une normalisation canonique NFC.
- Les importations sont adaptées aux fichiers texte UTF-8 ; pas de PDF/DOCX ni d'inspection de binaires, et pas de preuve cryptographique d'intégrité.
- Historique non conservé ; données de presse-papiers éventuellement stockées par le système après une copie volontaire.
- La lecture du rapport ne représente pas les groupes de changements comme des hunks unifiés applicables ; aucune réécriture automatique des sources n'est tentée.
