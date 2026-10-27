# LoanSim — Traçabilité technique Louvre

## Problème, différenciation et décisions

Échéancier de prêt amortissable, mensualité et économie liée à un remboursement anticipé. MoneyUntil (budget jusqu’à la paie) et FuelMath (déplacement) — aucun échéancier de crédit.

Architecture volontairement sans framework : `core.js` (fonctions métier vérifiables en Node), `app.js` (interactions DOM et état), `index.html` (sémantique accessible), `style.css` (mise en page spécifique), `sw.js` (coquille hors ligne), `tests/` (vérifications). Cette structure applique des **principes transposables** des ouvrages, sans prétendre utiliser un framework absent.

## Références exactes et adaptations appliquées

### 1. TS16-001

- **Identifiant et fiche lue** : `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 16, pages PDF 396–400. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : Core.validate vérifie taux, capital, nombre entier de périodes et champs autorisés.

### 2. FULL08-001

- **Identifiant et fiche lue** : `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 8, pages PDF 160–174. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : tests/core.test.cjs couvre taux nul, taux élevé, arrondis et amortissement.

### 3. NEXT08-001

- **Identifiant et fiche lue** : `NEXT08-001` — `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 8, pages PDF 212–226. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : app.js calcule deux scénarios dérivés sans persister ni envoyer les données.

### 4. VUE07-001

- **Identifiant et fiche lue** : `VUE07-001` — `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 7, pages PDF 186–202. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : core.js abstrait simulation mathématique de l’interface : réemploi Web/mobile.

### 5. GHA04-001

- **Identifiant et fiche lue** : `GHA04-001` — `technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 4, pages PDF 59–75. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : CI dédiée sur PR, validation syntaxe + cas limites + navigateur.

## Qualité et preuve

- Vérifications locales à effectuer / résultats dans GitHub Actions : `node --test apps/loansim/tests/core.test.cjs`, `python apps/loansim/tests/browser.test.py`.
- Aucun succès Chrome prétendu avant confirmation du journal réel de la CI.
- Les tests métier vérifient les propriétés spécifiques à **LoanSim**, pas uniquement la création et la suppression de données.
- Workflow en lecture seule, aucune fusion automatique ; le déploiement GitHub Pages n'est autorisé que sur `main`.

## Limites

MoneyUntil (budget jusqu’à la paie) et FuelMath (déplacement) — aucun échéancier de crédit. Les résultats sont locaux et ne reposent sur aucune donnée externe vérifiée. Les propriétés de stockage ou d'accessibilité ne sont pas certifiées pour tous les navigateurs.
