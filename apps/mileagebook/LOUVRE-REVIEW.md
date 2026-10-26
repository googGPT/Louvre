# MileageBook v2 — revue technique Louvre

## Audit et changements
L'application 16 originale (PR #33) avait une somme des montants en virgule flottante avant un arrondi global, un tableau non filtrable et un champ « Remboursé ? » nécessitant l'édition complète de la fiche. La nouvelle version effectue le calcul et l'arrondi **trajet par trajet** avec des centimes entiers ; elle fournit un tableau de bord filtré, un suivi des mois et la mise à jour des statuts en un clic. Les dates impossibles, taux non finis ou nombres décimaux aux précisions déraisonnables sont rejetés, sans appliquer de règle fiscale inventée.

## Les cinq fiches Louvre utilisées
| Ouvrage | Fiche vérifiée dans le dépôt | Pages indiquées dans la fiche | Application originale |
| --- | --- | --- | --- |
| *Total TypeScript: The Essentials* (SRC-001) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | ch. 16, PDF 396–400 | `core.js`: `normalizeRecord` rejette types, dates, identifiants et montants incompatibles avant persistance ; les propriétés supplémentaires des archives v1 sont normalisées. |
| *The Complete Developer* (SRC-002) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | ch. 8, PDF 160–174 | Tests du calcul, des dates, filtrages, arrondis, CSV, archives et scénarios Chromium dans `tests/`. |
| *Ultimate Next.js for Modern Web Applications* (SRC-003) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | ch. 8, PDF 212–226 | État persistant = fiches ; `compute` dérive les indicateurs et séries mensuelles sans écrire des doublons d'état côté serveur. Pas de SSR inutile. |
| *Building Real-World Web Applications with Vue.js 3* (SRC-004) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | ch. 7, PDF 186–202 | `core.js` pur portable ; `app.js` isolé du stockage/navigateur, possibilité de portage sans imposer Vue ou Quasar. |
| *Learning GitHub Actions* (SRC-005) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | ch. 9, PDF 210–220 | `.github/workflows/louvre-mileagebook-qa.yml` : job QA avec `permissions: contents: read`, entrées PR non interpolées dans les commandes, pas de secrets ou déploiement direct. |

**Limite de provenance :** fiches techniques du dépôt inspectées ; les pages sont rapportées par ces fiches. Aucune relecture intégrale des PDF n'est prétendue. Les implémentations sont originales, inspirées des principes pertinents.

## Vie privée, risques et compromis
- Pas d'API payante, pas de tracking, pas de compte, pas de backend.
- CSV et sauvegardes JSON peuvent contenir des lieux et motifs privés. Conserver hors accès public.
- Neutralisation de colonnes CSV susceptibles de déclencher des formules chez certains tableurs (ne garantit pas la sécurité de tous les importeurs).
- Import JSON strictement vérifié avant remplacement, avec confirmation. En cas de stockage local corrompu, édition verrouillée et copie brute disponible.
- L'utilisateur doit entrer les taux corrects et le kilométrage réel ; aucun barème officiel, aucune qualification du caractère professionnel des trajets, aucun paiement effectif n'est vérifié.
- La progression PWA hors ligne dépend de l'installation du service worker et d'une première visite connectée. La suppression des données de site peut détruire le journal.

## Contrôle qualité
Commandes `node --check` sur chaque script, `node --test apps/mileagebook/tests/core.test.cjs`, `python apps/mileagebook/tests/browser.test.py`. **Ne pas considérer un test navigateur vert avant vérification réelle du log GitHub Actions**. Fusion interdite en cas d'échec. Le workflow général doit conserver toutes les applications déjà publiées.