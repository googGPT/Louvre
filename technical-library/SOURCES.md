# Catalogue des sources

> **État actuel — étape 3C6 (25 octobre 2026) : 75 fiches et 70/70 chapitres possédant au moins une analyse ciblée.** Ceci représente un index documentaire initial, **pas une lecture complète des cinq livres**, ni une garantie de conformité des techniques avec les versions logicielles actuelles. Les chiffres plus anciens des sections suivantes sont conservés comme historique.

> **État courant — lot 3C5 : 56 fiches correspondant à 51 chapitres possédant une analyse partielle sur 70.** Les chiffres plus anciens du présent document sont conservés à des fins d'historique. Le nouveau lot comprend 11 fiches, dont une seconde analyse du chapitre Vue 5.

> **Statut actuel (25 octobre 2026 — lot 3C4) :** 45 fiches distinctes, 41 chapitres partiellement couverts sur les 70 chapitres répertoriés. Les statistiques antérieures figurant dans les sections historiques correspondent à l'état des anciens lots et ne doivent pas être interprétées comme l'état courant. Les nouveaux PDF ont été lus de manière ciblée dans l'environnement source ChatGPT, sans publier les livres.

> **Statut actuel au 25 octobre 2026 (lot 3C3) :** 35 fiches décrivent des concepts de **31 chapitres**, sans couvrir intégralement les ouvrages. Les chiffres de 15 ou 25 dans les sections plus anciennes sont historiques. Les exemples TypeScript du lot 3C3 ont passé compilation stricte et scénarios Node 22 ; les autres applications ne sont pas testées.

> **Statut actuel — 25 octobre 2026 : 25 fiches issues de 21 chapitres partiellement couverts.** Les paragraphes historiques sur la non-consultation des PDF concernent les environnements Codex utilisés pendant les premières intégrations. Pour le lot 3C2, les pages et empreintes ont été vérifiées sur les fichiers originaux disponibles dans l'environnement source ChatGPT.


> **Statut courant (lot 3C1, 25 octobre 2026) :** 15 fiches documentées, dont 10 nouvelles issues des cinq ouvrages. Les remarques des sections historiques sur l'absence d'analyse correspondent aux étapes précédentes ; la cartographie des 70 chapitres ne constitue toujours pas une lecture exhaustive. La consultation PDF des nouvelles fiches et la compilation TypeScript sont attribuées au livrable ChatGPT, et non à une exécution dans Codex.

Les titres, auteurs et années ci-dessous sont transcrits de la demande utilisateur ; ils ne sont pas vérifiés dans les ouvrages. Les domaines techniques sont des classements provisoires déduits des titres, sans analyse du contenu. Les éditeurs n'étaient pas renseignés à l'étape 1 ; les cartographies désormais fournies en indiquent, sans vérification indépendante sur les ouvrages.

Les cinq PDF sont signalés comme ayant été fournis dans une conversation ChatGPT distincte. Leur accessibilité ici n'est pas établie ; aucun PDF n'a été consulté dans cet environnement Codex. L'étape 3A intègre un pilote provenant de l'environnement source ChatGPT, sans revérification du PDF ici.

## Cartographies intégrées — étape 2

Les cinq cartographies et leur [README](source-maps/README.md) sont importés depuis `Louvre_ETAPE2_source_maps.zip`, fourni par l'utilisateur. Leurs 70 entrées de chapitres ont été comptées ; la concordance des pages avec les PDF et les empreintes SHA-256 fournies n'a pas été vérifiée sur les originaux. Une cartographie documentaire ne constitue pas une extraction approfondie de connaissances.

Les identifiants `SRC-001` à `SRC-005` restent les identifiants du catalogue. Les identifiants propres au livrable sont conservés et reliés ci-dessous, sans les remplacer.

## SRC-001

- **Titre :** Total TypeScript: The Essentials
- **Auteurs :** Matt Pocock et Taylor Bell
- **Année :** 2026 — fournie par l'utilisateur, à vérifier
- **Éditeur :** No Starch Press — indiqué dans la cartographie fournie, à vérifier sur le PDF
- **Domaine technique :** TypeScript — classement provisoire d'après le titre
- **Statut d'accès au PDF :** signalé dans une autre conversation ; accès ici non établi
- **État de l'analyse :** cartographie intégrée (16 chapitres) ; cinq fiches pilotes du chapitre 15 intégrées depuis ChatGPT, sans couverture exhaustive du chapitre
- **Observations :** titre, auteurs, année et édition à vérifier sur le document accessible ; aucune page relevée directement dans le PDF ni citation extraite ici ; pages de début fournies dans la cartographie liée.
- **Cartographie :** [`TS-2026`](source-maps/total-typescript.md) — correspondance avec `SRC-001` ; références aux pages PDF importées, non revérifiées ici.

### Pilote TS-2026 — chapitre 15

Cinq fiches disponibles :

- [TS15-001-generic-types](concepts/language-and-types/TS15-001-generic-types.md)
- [TS15-002-template-literals](concepts/language-and-types/TS15-002-template-literals.md)
- [TS15-003-conditional-types](concepts/language-and-types/TS15-003-conditional-types.md)
- [TS15-004-mapped-types](concepts/language-and-types/TS15-004-mapped-types.md)
- [TS15-005-result-errors](concepts/language-and-types/TS15-005-result-errors.md)

[Exemple original](examples/type-patterns.ts) ; [rapport de validation et distinction des environnements](validation/TS15-static-typecheck.md).

Pages PDF déclarées par le lot source : 362–387, avec plages précises par fiche. Empreinte fournie identique à la cartographie `TS-2026`, non recalculée ici. Lecture PDF et compilation TypeScript 5.8.3 rapportées de l'environnement source ChatGPT ; ni consultation du PDF ni compilation reproduite dans Codex. Les quinze autres chapitres de cet ouvrage et les quatre autres ouvrages restent uniquement cartographiés.

## SRC-002

- **Titre :** The Complete Developer
- **Auteur :** Martin Krause
- **Année :** 2024 — fournie par l'utilisateur, à vérifier
- **Éditeur :** No Starch Press — indiqué dans la cartographie fournie, à vérifier sur le PDF
- **Domaine technique :** développement logiciel — classement provisoire d'après le titre ; périmètre à confirmer
- **Statut d'accès au PDF :** signalé dans une autre conversation ; accès ici non établi
- **État de l'analyse :** cartographie intégrée (16 chapitres) ; extraction approfondie non commencée
- **Observations :** titre, auteur, année et édition à vérifier sur le document accessible ; aucune page relevée directement dans le PDF ni citation extraite ici ; pages de début fournies dans la cartographie liée.
- **Cartographie :** [`FULL-2024`](source-maps/complete-developer.md) — correspondance avec `SRC-002` ; références aux pages PDF importées, non revérifiées ici.

## SRC-003

- **Titre :** Ultimate Next.js for Modern Web Applications
- **Auteur :** Shubham Jain
- **Année :** 2026 — fournie par l'utilisateur, à vérifier
- **Éditeur :** Orange Education — indiqué dans la cartographie fournie, à vérifier sur le PDF
- **Domaine technique :** Next.js et applications Web — classement provisoire d'après le titre
- **Statut d'accès au PDF :** signalé dans une autre conversation ; accès ici non établi
- **État de l'analyse :** cartographie intégrée (14 chapitres) ; extraction approfondie non commencée
- **Observations :** titre, auteur, année, édition et versions logicielles abordées à vérifier ; aucune page relevée directement dans le PDF ni citation extraite ici ; pages de début fournies dans la cartographie liée.
- **Cartographie :** [`NEXT-2026`](source-maps/ultimate-nextjs.md) — correspondance avec `SRC-003` ; références aux pages PDF importées, non revérifiées ici.

## SRC-004

- **Titre :** Building Real-World Web Applications with Vue.js 3
- **Auteur :** Joran Quinten
- **Année :** 2024 — fournie par l'utilisateur, à vérifier
- **Éditeur :** Packt Publishing — indiqué dans la cartographie fournie, à vérifier sur le PDF
- **Domaine technique :** Vue.js 3 et applications Web — classement provisoire d'après le titre
- **Statut d'accès au PDF :** signalé dans une autre conversation ; accès ici non établi
- **État de l'analyse :** cartographie intégrée (10 chapitres) ; extraction approfondie non commencée
- **Observations :** titre, auteur, année, édition et versions précises abordées à vérifier ; aucune page relevée directement dans le PDF ni citation extraite ici ; pages de début fournies dans la cartographie liée.
- **Cartographie :** [`VUE-2024`](source-maps/vuejs-3-real-world.md) — correspondance avec `SRC-004` ; références aux pages PDF importées, non revérifiées ici.

## SRC-005

- **Titre :** Learning GitHub Actions
- **Auteur :** Brent Laster
- **Année :** 2023 — fournie par l'utilisateur, à vérifier
- **Éditeur :** O’Reilly Media — indiqué dans la cartographie fournie, à vérifier sur le PDF
- **Domaine technique :** GitHub Actions et automatisation — classement provisoire d'après le titre
- **Statut d'accès au PDF :** signalé dans une autre conversation ; accès ici non établi
- **État de l'analyse :** cartographie intégrée (14 chapitres) ; extraction approfondie non commencée
- **Observations :** titre, auteur, année et édition à vérifier ; compatibilité des pratiques avec les versions actuelles à contrôler lors d'une analyse future ; aucune page relevée directement dans le PDF ni citation extraite ici ; pages de début fournies dans la cartographie liée.
- **Cartographie :** [`GHA-2023`](source-maps/github-actions.md) — correspondance avec `SRC-005` ; références aux pages PDF importées, non revérifiées ici.


## Lot 3C1 — Références nouvelles

| Fiche | Source et chapitre | Chemin | Pages PDF référencées |
|---|---|---|---|
| `TS05-001` | `TS-2026 chap. 5` | [Fiche](concepts/language-and-types/TS05-001-discriminated-unions.md) | 127–133 |
| `TS10-001` | `TS-2026 chap. 10` | [Fiche](concepts/language-and-types/TS10-001-derive-types.md) | 228–233 ; 242–244 |
| `FULL06-001` | `FULL-2024 chap. 6` | [Fiche](concepts/backend-and-apis/FULL06-001-rest-versus-graphql.md) | 124–125 ; 131–138 |
| `FULL08-001` | `FULL-2024 chap. 8` | [Fiche](concepts/testing/FULL08-001-tdd-and-test-doubles.md) | 160–169 ; 169–174 |
| `NEXT03-001` | `NEXT-2026 chap. 3` | [Fiche](concepts/frontend/NEXT03-001-rendering-strategies.md) | 72–77 ; 83–95 |
| `NEXT06-001` | `NEXT-2026 chap. 6` | [Fiche](concepts/frontend/NEXT06-001-data-fetching-tradeoffs.md) | 160–173 ; 175–185 |
| `VUE05-001` | `VUE-2024 chap. 5` | [Fiche](concepts/frontend/VUE05-001-pinia-state.md) | 133–144 |
| `VUE08-001` | `VUE-2024 chap. 8` | [Fiche](concepts/frontend/VUE08-001-realtime-quiz-events.md) | 229–231 ; 234–240 |
| `GHA07-001` | `GHA-2023 chap. 7` | [Fiche](concepts/devops/GHA07-001-artifacts-versus-cache.md) | 144–158 |
| `GHA09-001` | `GHA-2023 chap. 9` | [Fiche](concepts/security/GHA09-001-permissions-and-untrusted-input.md) | 210–211 ; 213–220 |

Les dix fiches du lot 3C1 complètent les cinq fiches TS15 ; leurs exemples ne sont pas nécessairement exécutés. Les éventuelles mentions « analyse non commencée » ci-dessus décrivent l'état antérieur à ce lot.


## Lot 3C2 — Dix fiches supplémentaires

| Identifiant | Source | Chapitre | Pages PDF | Fiche |
|---|---|---:|---|---|
| `TS14-001` | `SRC-001` | 14 | 337–346  | [Lire](concepts/language-and-types/TS14-001-strict-compiler-config.md) |
| `TS16-001` | `SRC-001` | 16 | 396–400  | [Lire](concepts/language-and-types/TS16-001-runtime-type-guards.md) |
| `FULL07-001` | `SRC-002` | 7 | 145–153  | [Lire](concepts/backend-and-apis/FULL07-001-mongoose-schema-boundary.md) |
| `FULL09-001` | `SRC-002` | 9 | 187–201  | [Lire](concepts/security/FULL09-001-oauth-delegation-flow.md) |
| `NEXT05-001` | `SRC-003` | 5 | 127–141  | [Lire](concepts/security/NEXT05-001-authorization-server-checks.md) |
| `NEXT09-001` | `SRC-003` | 9 | 230–242  | [Lire](concepts/frontend/NEXT09-001-image-and-cache-performance.md) |
| `VUE03-001` | `SRC-004` | 3 | 52–65  | [Lire](concepts/frontend/VUE03-001-async-api-and-geolocation.md) |
| `VUE07-001` | `SRC-004` | 7 | 186–202  | [Lire](concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md) |
| `GHA04-001` | `SRC-005` | 4 | 59–75  | [Lire](concepts/devops/GHA04-001-workflow-trigger-design.md) |
| `GHA08-001` | `SRC-005` | 8 | 169–180  | [Lire](concepts/devops/GHA08-001-concurrency-groups.md) |

La validation structurelle automatique ne remplace pas la relecture technique ni les tests des applications développées ensuite.


## Lot 3C3 — Dix autres chapitres représentés

| ID | Ouvrage | Chapitre | Pages PDF | Fiche |
|---|---|---:|---|---|
| `TS06-001` | `SRC-001` | 6 | 159–167 | [Lire](concepts/language-and-types/TS06-001-object-update-types.md) |
| `TS11-001` | `SRC-001` | 11 | 255–260 | [Lire](concepts/language-and-types/TS11-001-satisfies-versus-assertions.md) |
| `FULL10-001` | `SRC-002` | 10 | 203–211 | [Lire](concepts/architecture-and-devops/FULL10-001-docker-repeatable-environments.md) |
| `FULL16-001` | `SRC-002` | 16 | 283–287 | [Lire](concepts/testing/FULL16-001-dockerized-ui-testing.md) |
| `NEXT02-001` | `SRC-003` | 2 | 43–67 | [Lire](concepts/frontend/NEXT02-001-file-based-routing.md) |
| `NEXT10-001` | `SRC-003` | 10 | 248–263 | [Lire](concepts/testing/NEXT10-001-test-ui-and-api.md) |
| `VUE06-001` | `SRC-004` | 6 | 171–182 | [Lire](concepts/frontend/VUE06-001-chart-data-contract.md) |
| `VUE10-001` | `SRC-004` | 10 | 272–296 | [Lire](concepts/frontend/VUE10-001-nuxt-headless-cms.md) |
| `GHA05-001` | `SRC-005` | 5 | 89–109 | [Lire](concepts/devops/GHA05-001-hosted-vs-self-hosted-runners.md) |
| `GHA10-001` | `SRC-005` | 10 | 245–268 | [Lire](concepts/devops/GHA10-001-workflow-diagnostics.md) |

[Audit de provenance du lot 3C3](validation/batch-3c3-source-audit.md). L'ensemble représente une couverture partielle, et non un audit complet des 31 chapitres.


## Lot 3C4 — Dix chapitres nouvellement représentés

| Fiche | Catalogue | Chapitre | Pages physiques PDF examinées | Chemin |
|---|---|---:|---|---|
| `TS03-001` | `SRC-001` | 3 | 54, 55, 56, 58, 59. | [Consulter](concepts/language-and-types/TS03-001-typecheck-and-build.md) |
| `TS07-001` | `SRC-001` | 7 | 169, 170, 174, 175, 180, 181, 185, 187. | [Consulter](concepts/language-and-types/TS07-001-readonly-contracts.md) |
| `FULL12-001` | `SRC-002` | 12 | 225, 227, 228, 230, 232, 234, 235. | [Consulter](concepts/backend-and-apis/FULL12-001-database-services.md) |
| `FULL13-001` | `SRC-002` | 13 | 237, 238, 239, 240, 241, 242, 243. | [Consulter](concepts/backend-and-apis/FULL13-001-modular-graphql-resolvers.md) |
| `NEXT04-001` | `SRC-003` | 4 | 100, 102, 103, 106, 108, 115, 116. | [Consulter](concepts/backend-and-apis/NEXT04-001-api-route-validation.md) |
| `NEXT11-001` | `SRC-003` | 11 | 265, 266, 267, 269, 272, 275, 282, 283. | [Consulter](concepts/architecture-and-devops/NEXT11-001-deployment-readiness.md) |
| `VUE04-001` | `SRC-004` | 4 | 82, 89, 92, 97, 101, 107, 108. | [Consulter](concepts/frontend/VUE04-001-composables-api-search.md) |
| `VUE09-001` | `SRC-004` | 9 | 244, 245, 246, 247, 248, 250, 254, 260, 266. | [Consulter](concepts/ai-and-frontend/VUE09-001-browser-object-detection.md) |
| `GHA06-001` | `SRC-005` | 6 | 113, 115, 118, 121, 125, 126, 128, 132, 134, 137. | [Consulter](concepts/devops/GHA06-001-environments-and-secrets.md) |
| `GHA11-001` | `SRC-005` | 11 | 281, 282, 283, 285, 286, 289, 310, 312, 313. | [Consulter](concepts/devops/GHA11-001-local-composite-actions.md) |

[Rapport 3C4](validation/batch-3c4-source-and-typechecks.md). Les notes reproduisent uniquement des synthèses originales, avec limites et adaptations. Une fiche ne signifie pas chapitre lu intégralement.


## Lot 3C5 — 11 nouvelles fiches issues de 10 chapitres auparavant non étudiés (plus une nouvelle fiche du chapitre Vue 5)

| Fiche | Catalogue | Chapitre | Pages physiques PDF | Chemin |
|---|---|---:|---|---|
| `FULL11-001` | `SRC-002` | 11 | 216–223 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/architecture-and-devops/FULL11-001-compose-service-topology.md) |
| `GHA12-001` | `SRC-005` | 12 | 322–329 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/devops/GHA12-001-reusable-workflows.md) |
| `GHA13-001` | `SRC-005` | 13 | 344–352 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/devops/GHA13-001-job-matrix-design.md) |
| `NEXT08-001` | `SRC-003` | 8 | 212–226 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/frontend/NEXT08-001-client-vs-server-state.md) |
| `NEXT12-001` | `SRC-003` | 12 | 287–290, 295–304 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/frontend/NEXT12-001-middleware-locales-edge.md) |
| `VUE01-001` | `SRC-004` | 1 | 26–33 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/frontend/VUE01-001-vue-project-structure.md) |
| `VUE02-001` | `SRC-004` | 2 | 40–47 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/frontend/VUE02-001-vue-reactivity-localstorage.md) |
| `VUE05-002` | `SRC-004` | 5 | 117–128 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/frontend/VUE05-002-vuetify-dialog-events.md) |
| `TS12-001` | `SRC-001` | 12 | 295–298 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/language-and-types/TS12-001-callback-assignability.md) |
| `TS13-001` | `SRC-001` | 13 | 316–324 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/language-and-types/TS13-001-declaration-files.md) |
| `FULL15-001` | `SRC-002` | 15 | 262–265, 277–281 (numérotation à partir de 1, non identique à la pagination imprimée). | [fiche](concepts/security/FULL15-001-oauth-session-graphql-guard.md) |

Consulter [l'audit des sources](validation/batch-3c5-source-audit.md) et le [parcours inter-ouvrages pour les réservations](playbooks/reservation-system-cross-book.md). Aucun PDF privé n'est publié.


## Étape 3C6 — 19 derniers chapitres ajoutés au catalogue

| Fiche | Livre | Chapitre | Pages physiques lues | Lien |
|---|---|---:|---|---|
| `TS01-001` | `SRC-001` | 1 | 33, 34, 35 | [fiche](concepts/language-and-types/TS01-001-feedback-loop.md) |
| `TS02-001` | `SRC-001` | 2 | 39, 40, 41, 42 | [fiche](concepts/language-and-types/TS02-001-ide-feedback-and-refactoring.md) |
| `TS04-001` | `SRC-001` | 4 | 63, 64, 65, 66 | [fiche](concepts/language-and-types/TS04-001-annotation-versus-inference.md) |
| `TS08-001` | `SRC-001` | 8 | 189, 190, 191, 192 | [fiche](concepts/language-and-types/TS08-001-class-constructor-contract.md) |
| `TS09-001` | `SRC-001` | 9 | 211, 212, 213, 214 | [fiche](concepts/language-and-types/TS09-001-enum-runtime-tradeoffs.md) |
| `FULL01-001` | `SRC-002` | 1 | 33, 34, 35, 36 | [fiche](concepts/architecture-and-devops/FULL01-001-node-project-manifest.md) |
| `FULL02-001` | `SRC-002` | 2 | 45, 46, 47 | [fiche](concepts/architecture-and-devops/FULL02-001-es-modules-boundaries.md) |
| `FULL03-001` | `SRC-002` | 3 | 63, 64, 65 | [fiche](concepts/architecture-and-devops/FULL03-001-static-type-boundary.md) |
| `FULL04-001` | `SRC-002` | 4 | 83, 84, 85, 86 | [fiche](concepts/architecture-and-devops/FULL04-001-react-declarative-components.md) |
| `FULL05-001` | `SRC-002` | 5 | 99, 100, 101, 102 | [fiche](concepts/architecture-and-devops/FULL05-001-nextjs-pages-routing-boundary.md) |
| `FULL14-001` | `SRC-002` | 14 | 245, 246, 247, 248 | [fiche](concepts/architecture-and-devops/FULL14-001-frontend-components-integration.md) |
| `NEXT01-001` | `SRC-003` | 1 | 27, 28, 29, 30 | [fiche](concepts/frontend/NEXT01-001-react-framework-bootstrap.md) |
| `NEXT07-001` | `SRC-003` | 7 | 189, 190, 191, 192 | [fiche](concepts/frontend/NEXT07-001-global-vs-module-css.md) |
| `NEXT13-001` | `SRC-003` | 13 | 307, 308, 309, 310 | [fiche](concepts/frontend/NEXT13-001-commerce-blog-dataflows.md) |
| `NEXT14-001` | `SRC-003` | 14 | 331, 332, 333, 334 | [fiche](concepts/frontend/NEXT14-001-portfolio-evidence-for-developers.md) |
| `GHA01-001` | `SRC-005` | 1 | 25, 26, 27, 28 | [fiche](concepts/devops/GHA01-001-automation-event-fit.md) |
| `GHA02-001` | `SRC-005` | 2 | 37, 38, 39, 40 | [fiche](concepts/devops/GHA02-001-events-jobs-steps.md) |
| `GHA03-001` | `SRC-005` | 3 | 47, 48, 49, 50, 53 | [fiche](concepts/devops/GHA03-001-action-metadata-contract.md) |
| `GHA14-001` | `SRC-005` | 14 | 359, 360, 361, 362 | [fiche](concepts/devops/GHA14-001-legacy-ci-migration-audit.md) |

[Protocole de vérification et limites](validation/batch-3c6-70-chapter-audit.md). Les concepts sont des synthèses originales ; les livres privés ne sont pas ajoutés au dépôt public.
