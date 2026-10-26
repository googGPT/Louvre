# ColorContrast — Traçabilité technique Louvre

## Problème, différenciation et décisions

Contraste WCAG 2.x entre texte et fond, design de palettes lisibles. Aucune application parmi les 27 ne calcule de luminance relative ni conformité AA/AAA.

Architecture volontairement sans framework : `core.js` (fonctions métier vérifiables en Node), `app.js` (interactions DOM et état), `index.html` (sémantique accessible), `style.css` (mise en page spécifique), `sw.js` (coquille hors ligne), `tests/` (vérifications). Cette structure applique des **principes transposables** des ouvrages, sans prétendre utiliser un framework absent.

## Références exactes et adaptations appliquées

### 1. TS16-001

- **Identifiant et fiche lue** : `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 16, pages PDF 396–400. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : Core.normalize et validateBackup rejettent HEX et JSON falsifiés.

### 2. FULL08-001

- **Identifiant et fiche lue** : `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 8, pages PDF 160–174. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : tests/core.test.cjs vérifie noir/blanc, seuils AA/AAA, import.

### 3. NEXT10-001

- **Identifiant et fiche lue** : `NEXT10-001` — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 10, pages PDF 248–263. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : tests/browser.test.py vérifie interactions de l’UI indépendamment des tests purs.

### 4. VUE02-001

- **Identifiant et fiche lue** : `VUE02-001` — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 2, pages PDF 40–47. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : app.js dérive résultats depuis deux couleurs et stocke seulement les palettes.

### 5. GHA09-001

- **Identifiant et fiche lue** : `GHA09-001` — `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 9, pages PDF 210–220. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : CI en lecture seule ; aucune interpolation des textes utilisateurs dans des scripts.

## Qualité et preuve

- Vérifications locales à effectuer / résultats dans GitHub Actions : `node --test apps/colorcontrast/tests/core.test.cjs`, `python apps/colorcontrast/tests/browser.test.py`.
- Aucun succès Chrome prétendu avant confirmation du journal réel de la CI.
- Les tests métier vérifient les propriétés spécifiques à **ColorContrast**, pas uniquement la création et la suppression de données.
- Workflow en lecture seule, aucune fusion automatique ; le déploiement GitHub Pages n'est autorisé que sur `main`.

## Limites

Aucune application parmi les 27 ne calcule de luminance relative ni conformité AA/AAA. Les résultats sont locaux et ne reposent sur aucune donnée externe vérifiée. Les propriétés de stockage ou d'accessibilité ne sont pas certifiées pour tous les navigateurs.


## Audit de fiabilisation — application globale 23, ColorContrast v2 (26 octobre 2026)

### Problèmes observés dans la première version
1. **Modification avant écriture** : ajout et suppression utilisaient `palette.pairs.push/splice` avant de vérifier `localStorage.setItem`, créant une incohérence possible après échec de quota. Correction : `save(next)` valide, écrit, puis remplace la source de vérité.
2. **Restauration fragile** : `blocked=false` était défini avant d'assurer la réussite de l'écriture. Correction : verrou maintenu jusqu'au succès de la validation et de la sauvegarde.
3. **Ambiguïté des seuils** : `ratio.toFixed(2)` pouvait afficher `4.50:1` pour un ratio légèrement inférieur à `4.5`, alors que `wcag` compare correctement le nombre non arrondi. Correction : quatre décimales, statut textuel et tests explicites, notamment `#707972` sur blanc (4.499795… : AA normal refusé).
4. **Correction trop brutale** : seule l'alternative noir/blanc était proposée. Ajout d'un outil guidé vers le seuil 3, 4.5 ou 7 en conservant autant que possible la couleur de départ sur deux trajectoires RVB vers noir et blanc. Les cas de seuil inatteignable sur fond fixe sont signalés sans fausse promesse.
5. **Favoris** : ajout automatique de doublons, absence de confirmation avant suppression, et pas de secours brut en cas de corruption. Correction : garde anti-doublons à la création, confirmation, export brut et sauvegardes JSON v1 strictement compatibles.
6. **UI** : affichage peu détaillé et aucun extrait CSS ; désormais comparaisons chiffrées, état AA par favori, CSS prêt à copier et interface 390 px testée.

### Standards officiels, indépendants des ouvrages Louvre

- W3C, WCAG 2.2, SC 1.4.3 : texte courant 4.5:1, grand texte 3:1, non arrondis avant comparaison : https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html.
- W3C, WCAG 2.2, SC 1.4.6 : AAA texte normal 7:1, grand texte 4.5:1 : https://www.w3.org/TR/WCAG22/.
- Les recommandations et calculs techniques de cette version sont des **adaptations originales** Louvre, et non des algorithmes ou mesures attribuables aux cinq livres listés plus haut.

### Testabilité et limites

Moteur pur avec nouvelle méthode `suggestForeground`, `summarize`, `cssSnippet`, validation stricte des valeurs des entrées. Les tests vérifient les seuils mathématiques (y compris 4.4998:1), l'atteignabilité des suggestions, les données importées, les favoris, le blocage par échec du navigateur et la récupération après corruption.

Le correcteur n'est **pas** une optimisation perceptuelle globale ; il minimise la distance euclidienne RVB entre deux recherches progressives seulement. Ne prétendre ni tester des couleurs alpha, des textes sur image, l'antialiasing ni l'accessibilité complète. Aucune correction sans contrôle WCAG réel sur la page cible.

### Numérotation et protection du dépôt

Dans le registre Louvre, **ColorContrast est n° 03/20 vague 2, donc n° 23 au total** ; le titre initial « 02/20 » de la PR #40 contredisait ce registre et entrait en collision avec ShiftLedger n° 22. Ce défaut d'étiquetage est corrigé dans la documentation et le titre de PR. Aucune ancienne application et aucun branche `main` modifiés pendant cette mission.

Les sources/livres référencés à TS16-001, FULL08-001, NEXT10-001, VUE02-001 et GHA09-001 ont été consultés **par les fiches du dépôt**. Les numéros de pages appartiennent aux fiches techniques antérieures ; ne pas prétendre une relecture intégrale des PDF originaux dans ce contrôle.
