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
