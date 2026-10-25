# Index de consultation Louvre

Trouver un concept par son problème ou ses mots-clés, puis consulter uniquement les fiches pertinentes.

## Couverture vérifiée au 25 octobre 2026

- **75 fiches techniques distinctes**, réparties sur les cinq ouvrages.
- **70 chapitres cartographiés** ; **70 possèdent au moins une fiche**, sans couverture exhaustive.
- **0 chapitre n'est dépourvu de fiche**.
- Les nouvelles pages référencées proviennent d'une lecture ciblée des cinq PDF privés dans l'environnement ChatGPT ; Codex n'a pas lu les PDF.
- Les démonstrations applicatives doivent être testées dans les projets réels avant usage.
- Les contrôles documentaires automatisés utilisent [ce script](../scripts/validate_library.py) et [ce rapport](validation/batch-3c2-verified-source-notes.md). Ils ne certifient pas le code produit.

## Fiches issues des étapes précédentes (15)

## TS15-001 — Types génériques, valeurs par défaut et contraintes

- **Problème :** Factoriser les états de chargement de ressources aux contenus différents.
- **Mots-clés :** générique, ressource, ressources, generic, LoadState, Identified, contrainte, extends, paramètres par défaut.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-001-generic-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-001-generic-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 362–368.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Contraintes statiques, sans validation runtime ; context reste obligatoire dans ready.

## TS15-002 — Types de chaînes interpolées

- **Problème :** Distinguer statiquement les routes de projets des autres chemins.
- **Mots-clés :** route, routes, navigation, template literal, ProjectRoute, préfixe, chaîne.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-002-template-literals.md` — [ouvrir la fiche](concepts/language-and-types/TS15-002-template-literals.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 368–370 ; 382–383.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Le type accepte /projects/ sans identifiant ; garde runtime plus stricte ; unions potentiellement coûteuses.

## TS15-003 — Types conditionnels

- **Problème :** Transformer un scalaire en tableau sans ajouter un niveau aux tableaux existants.
- **Mots-clés :** conditionnel, conditionnels, conditional types, AsReadonlyArray, tableau, scalaire, readonly.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-003-conditional-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-003-conditional-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 370–371.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** readonly ne gèle pas les objets ; distributivité et récursion non analysées en détail.

## TS15-004 — Mapped types et remappage des clés

- **Problème :** Dériver des getters typés depuis un modèle sans divergence de contrats.
- **Mots-clés :** getter, getters, GetterFunctions, mapped types, keyof, remappage, clés, Capitalize.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-004-mapped-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-004-mapped-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 371–374 ; 384–387.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Ne crée pas les méthodes JavaScript ; collisions de noms à vérifier.

## TS15-005 — Résultat typé : succès et erreur

- **Problème :** Exprimer les erreurs métier prévisibles et imposer la distinction succès/échec.
- **Mots-clés :** Result<T, E>, Result, résultat, erreur, erreurs, succès, union discriminée, ok, parseAmount.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-005-result-errors.md` — [ouvrir la fiche](concepts/language-and-types/TS15-005-result-errors.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 375–379.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Ne remplace pas try/catch ; entrées externes et exceptions inattendues à traiter.

## Extension 3C1 — Dix concepts additionnels issus des cinq livres

La bibliothèque dispose maintenant de **15 fiches distinctes** couvrant partiellement **11 chapitres sur 70**. Chaque référence de page ci-dessous vient d'une analyse des PDF réalisée dans l'environnement source ChatGPT ; elle n'implique ni tests applicatifs ni analyse exhaustive du chapitre. Le Skills peut sélectionner directement les fiches liées.

### TS05-001 — Unions discriminées et états impossibles

- **Source :** TS-2026 chap. 5 ; pages PDF 127–133 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [TS05-001](concepts/language-and-types/TS05-001-discriminated-unions.md).
- **Mots-clés :** union discriminée, discriminated union, état, status, narrowing, exhaustivité.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### TS10-001 — Dériver les types des valeurs et contrats existants

- **Source :** TS-2026 chap. 10 ; pages PDF 228–233 ; 242–244 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [TS10-001](concepts/language-and-types/TS10-001-derive-types.md).
- **Mots-clés :** typeof, keyof, indexed access, ReturnType, DRY, dérivation.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### FULL06-001 — Choisir entre API REST et GraphQL selon les échanges

- **Source :** FULL-2024 chap. 6 ; pages PDF 124–125 ; 131–138 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [FULL06-001](concepts/backend-and-apis/FULL06-001-rest-versus-graphql.md).
- **Mots-clés :** REST, GraphQL, over-fetching, under-fetching, HTTP, contrat API, schéma.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### FULL08-001 — Tests dirigés par les exigences et doubles de dépendances

- **Source :** FULL-2024 chap. 8 ; pages PDF 160–169 ; 169–174 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [FULL08-001](concepts/testing/FULL08-001-tdd-and-test-doubles.md).
- **Mots-clés :** TDD, test unit, Jest, stub, fake, mock, isolation, couverture.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### NEXT03-001 — Choisir SSR, SSG, ISR ou CSR selon les contraintes

- **Source :** NEXT-2026 chap. 3 ; pages PDF 72–77 ; 83–95 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [NEXT03-001](concepts/frontend/NEXT03-001-rendering-strategies.md).
- **Mots-clés :** Next.js, SSR, SSG, ISR, CSR, cache, SEO, rendu, fraîcheur.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### NEXT06-001 — Séparer récupération des données, état client et revalidation

- **Source :** NEXT-2026 chap. 6 ; pages PDF 160–173 ; 175–185 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [NEXT06-001](concepts/frontend/NEXT06-001-data-fetching-tradeoffs.md).
- **Mots-clés :** Next.js, fetch, Axios, SWR, revalidation, erreur, chargement, cache.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### VUE05-001 — État partagé avec Pinia et valeurs calculées

- **Source :** VUE-2024 chap. 5 ; pages PDF 133–144 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [VUE05-001](concepts/frontend/VUE05-001-pinia-state.md).
- **Mots-clés :** Vue 3, Pinia, store, computed, state, état, actions, composition.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### VUE08-001 — Événements temps réel entre clients et serveur de quiz

- **Source :** VUE-2024 chap. 8 ; pages PDF 229–231 ; 234–240 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [VUE08-001](concepts/frontend/VUE08-001-realtime-quiz-events.md).
- **Mots-clés :** Vue 3, sockets, Socket.IO, événement, temps réel, quiz, score, lobby.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### GHA07-001 — Distinguer artefacts de build et caches de dépendances

- **Source :** GHA-2023 chap. 7 ; pages PDF 144–158 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [GHA07-001](concepts/devops/GHA07-001-artifacts-versus-cache.md).
- **Mots-clés :** GitHub Actions, artifact, cache, upload-artifact, download-artifact, needs, CI.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

### GHA09-001 — Limiter GITHUB_TOKEN et isoler les entrées non fiables

- **Source :** GHA-2023 chap. 9 ; pages PDF 210–211 ; 213–220 (vérifiées dans le livrable ChatGPT, non revérifiées dans Codex).
- **Fiche :** [GHA09-001](concepts/security/GHA09-001-permissions-and-untrusted-input.md).
- **Mots-clés :** GitHub Actions, permissions, GITHUB_TOKEN, least privilege, injection, pull request, workflow security.
- **Statut :** synthèse documentaire du lot 3C1 ; aucune validation applicative implicite.

## Fiches supplémentaires — lot 3C2 (10)

### TS14-001 — Configurer strict et les contrôles d’index

- **Problème :** Une application compile, mais laisse passer des valeurs nulles ou des accès hors limites à un tableau.
- **Mots-clés :** tsconfig, strict, noUncheckedIndexedAccess, undefined, target.
- **Fiche :** [TS14-001](concepts/language-and-types/TS14-001-strict-compiler-config.md) (`technical-library/concepts/language-and-types/TS14-001-strict-compiler-config.md`).
- **Référence :** `SRC-001` / `TS-2026`, chapitre 14 — Configuring TypeScript., pages PDF 337–346 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### TS16-001 — Prédicats et assertions de types honnêtes

- **Problème :** Une donnée inconnue reçue d’un service est artificiellement déclarée conforme à un type sans validation.
- **Mots-clés :** type predicate, type guard, assertion, unknown, runtime validation.
- **Fiche :** [TS16-001](concepts/language-and-types/TS16-001-runtime-type-guards.md) (`technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`).
- **Référence :** `SRC-001` / `TS-2026`, chapitre 16 — Building Powerful Shared Utilities., pages PDF 396–400 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### FULL07-001 — Frontière de données MongoDB et Mongoose

- **Problème :** La logique métier dépend directement des détails de persistance et confond document absent, erreur technique et erreur de validation.
- **Mots-clés :** Mongoose, MongoDB, schema, model, CRUD, repository.
- **Fiche :** [FULL07-001](concepts/backend-and-apis/FULL07-001-mongoose-schema-boundary.md) (`technical-library/concepts/backend-and-apis/FULL07-001-mongoose-schema-boundary.md`).
- **Référence :** `SRC-002` / `FULL-2024`, chapitre 7 — MongoDB and Mongoose., pages PDF 145–153 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### FULL09-001 — Comprendre OAuth, jetons et retour serveur

- **Problème :** Une application délègue l’accès à un fournisseur, mais confond autorisation déléguée, identité et privilèges internes.
- **Mots-clés :** OAuth, authorization, callback, JWT, claims, identity.
- **Fiche :** [FULL09-001](concepts/security/FULL09-001-oauth-delegation-flow.md) (`technical-library/concepts/security/FULL09-001-oauth-delegation-flow.md`).
- **Référence :** `SRC-002` / `FULL-2024`, chapitre 9 — Authorization with OAuth., pages PDF 187–201 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### NEXT05-001 — Séparer connexion et contrôle d’accès Next.js

- **Problème :** Un utilisateur authentifié tente d’accéder aux documents d’un autre compte via une route serveur.
- **Mots-clés :** Next.js, authentication, authorization, RBAC, session, IDOR.
- **Fiche :** [NEXT05-001](concepts/security/NEXT05-001-authorization-server-checks.md) (`technical-library/concepts/security/NEXT05-001-authorization-server-checks.md`).
- **Référence :** `SRC-003` / `NEXT-2026`, chapitre 5 — Authentication and Authorization., pages PDF 127–141 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### NEXT09-001 — Optimiser images, cache et métriques

- **Problème :** Une interface Next.js devient lente malgré des composants corrects.
- **Mots-clés :** Next.js, Lighthouse, image optimization, lazy loading, ISR, cache.
- **Fiche :** [NEXT09-001](concepts/frontend/NEXT09-001-image-and-cache-performance.md) (`technical-library/concepts/frontend/NEXT09-001-image-and-cache-performance.md`).
- **Référence :** `SRC-003` / `NEXT-2026`, chapitre 9 — Performance Optimization in Next.js., pages PDF 230–242 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### VUE03-001 — API asynchrones et géolocalisation dans Vue

- **Problème :** Une interface météo reste bloquée ou affiche de mauvaises données quand la localisation est refusée ou le réseau échoue.
- **Mots-clés :** Vue, geolocation, fetch, weather, reactive, asynchronous, permission.
- **Fiche :** [VUE03-001](concepts/frontend/VUE03-001-async-api-and-geolocation.md) (`technical-library/concepts/frontend/VUE03-001-async-api-and-geolocation.md`).
- **Référence :** `SRC-004` / `VUE-2024`, chapitre 3 — Building a Local Weather App., pages PDF 52–65 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### VUE07-001 — Partager la logique Vue entre Web et desktop

- **Problème :** Une application de suivi de dépenses doit servir plusieurs plateformes sans dupliquer toute sa logique.
- **Mots-clés :** Vue, Quasar, Electron, Supabase, multiplatform, expense.
- **Fiche :** [VUE07-001](concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md) (`technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`).
- **Référence :** `SRC-004` / `VUE-2024`, chapitre 7 — Building a Multiplatform Expense Tracker Using Quasar., pages PDF 186–202 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### GHA04-001 — Définir des workflows CI déclenchés au bon événement

- **Problème :** Une vérification automatique ne s’exécute pas au bon moment, ou ne s’exécute qu’à la demande.
- **Mots-clés :** GitHub Actions, workflows, triggers, pull_request, workflow_dispatch, CI.
- **Fiche :** [GHA04-001](concepts/devops/GHA04-001-workflow-trigger-design.md) (`technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`).
- **Référence :** `SRC-005` / `GHA-2023`, chapitre 4 — Working with Workflows., pages PDF 59–75 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

### GHA08-001 — Éviter les exécutions concurrentes inutiles

- **Problème :** Plusieurs pushes sur la même branche lancent des builds coûteux dont certains résultats deviennent obsolètes.
- **Mots-clés :** GitHub Actions, concurrency, cancel-in-progress, paths, filters.
- **Fiche :** [GHA08-001](concepts/devops/GHA08-001-concurrency-groups.md) (`technical-library/concepts/devops/GHA08-001-concurrency-groups.md`).
- **Référence :** `SRC-005` / `GHA-2023`, chapitre 8 — Managing Workflow Execution., pages PDF 169–180 .
- **Statut :** synthèse originale référencée ; intégration applicative non testée.

## Limites de couverture

Les autres chapitres figurent uniquement dans les [cartographies](source-maps/README.md). L'absence de fiche pertinente doit être signalée, sans inventer de conseil attribué aux auteurs.

## Lot 3C3 — Dix autres chapitres analysés partiellement

Les dix fiches supplémentaires traitent TypeScript, Docker, routage/tests Next.js, visualisation/CMS Vue et runners/diagnostic GitHub Actions. [Audit des sources](validation/batch-3c3-source-audit.md) ; [exemples TypeScript réellement vérifiés](examples/validated-contracts-3c3.ts).

### TS06-001 — Mettre à jour un objet sans dupliquer les contrats

- **Problème :** Construire une entrée de mise à jour sans recopier chaque propriété du modèle.
- **Mots-clés :** Partial, Omit, Pick, API patch, DTO, champs modifiables.
- **Fiche :** [TS06-001](concepts/language-and-types/TS06-001-object-update-types.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 6 — *Objects*, pages physiques PDF 159–167.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### TS11-001 — Préférer satisfies aux assertions de type injustifiées

- **Problème :** Vérifier qu’une configuration respecte un contrat tout en conservant les types précis inférés.
- **Mots-clés :** satisfies, as, inférence, sécurité des types, assertions.
- **Fiche :** [TS11-001](concepts/language-and-types/TS11-001-satisfies-versus-assertions.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 11 — *Annotations and Assertions*, pages physiques PDF 255–260.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### FULL10-001 — Construire des environnements reproductibles avec Docker

- **Problème :** Éviter qu’une application fonctionne sur une machine mais pas sur une autre.
- **Mots-clés :** Docker, Dockerfile, Compose, reproductibilité, isolation, services.
- **Fiche :** [FULL10-001](concepts/architecture-and-devops/FULL10-001-docker-repeatable-environments.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 10 — *Containerization with Docker*, pages physiques PDF 203–211.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### FULL16-001 — Faire tourner les tests UI dans un service Docker dédié

- **Problème :** Reproduire localement les tests d’interface avec un environnement de dépendances stable.
- **Mots-clés :** Jest, snapshot tests, Docker Compose, mocks, CI, états de session.
- **Fiche :** [FULL16-001](concepts/testing/FULL16-001-dockerized-ui-testing.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 16 — *Running Automated Tests in Docker*, pages physiques PDF 283–287.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### NEXT02-001 — Organiser les routes statiques, dynamiques et catch-all

- **Problème :** Créer des URL lisibles et prévoir les segments dynamiques sans maintenir un routeur manuel.
- **Mots-clés :** Next.js, App Router, Pages Router, slug, catch-all, routing.
- **Fiche :** [NEXT02-001](concepts/frontend/NEXT02-001-file-based-routing.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 2 — *Next.js File-Based Routing*, pages physiques PDF 43–67.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### NEXT10-001 — Tester composants et routes API avec des scénarios réalistes

- **Problème :** Vérifier une interface web et son API sans confondre test isolé et test de bout en bout.
- **Mots-clés :** Jest, React Testing Library, API tests, mocks, unit, integration.
- **Fiche :** [NEXT10-001](concepts/testing/NEXT10-001-test-ui-and-api.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 10 — *Unit Testing and Integration Testing*, pages physiques PDF 248–263.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### VUE06-001 — Transformer des données persistées en graphiques Vue

- **Problème :** Produire des visualisations cohérentes à partir de données collectées par une application.
- **Mots-clés :** Vue 3, Chart.js, vue-chartjs, graphiques, agrégation, Pinia.
- **Fiche :** [VUE06-001](concepts/frontend/VUE06-001-chart-data-contract.md).
- **Source :** `SRC-004` / `VUE-2024`, chapitre 6 — *Creating a Fitness Tracker with Data Visualization*, pages physiques PDF 171–182.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### VUE10-001 — Séparer le contenu éditorial du rendu Nuxt

- **Problème :** Permettre à un éditeur de modifier les contenus sans redéployer le code à chaque phrase.
- **Mots-clés :** Nuxt, Storyblok, headless CMS, contenu typé, SEO, SSG, déploiement.
- **Fiche :** [VUE10-001](concepts/frontend/VUE10-001-nuxt-headless-cms.md).
- **Source :** `SRC-004` / `VUE-2024`, chapitre 10 — *Creating a Portfolio with Nuxt.js and Storyblok*, pages physiques PDF 272–296.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### GHA05-001 — Choisir un runner GitHub hébergé ou autogéré selon le risque

- **Problème :** Décider où exécuter les workflows sans exposer les machines ou les identifiants.
- **Mots-clés :** GitHub Actions, runners, labels, self-hosted, isolation, public PR.
- **Fiche :** [GHA05-001](concepts/devops/GHA05-001-hosted-vs-self-hosted-runners.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 5 — *Runners*, pages physiques PDF 89–109.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

### GHA10-001 — Diagnostiquer un workflow sans divulguer de secrets

- **Problème :** Trouver pourquoi un pipeline échoue sans relancer à l’aveugle et sans exposer de secrets.
- **Mots-clés :** GitHub Actions, diagnostics, logs, badges, re-run, debug, artefacts.
- **Fiche :** [GHA10-001](concepts/devops/GHA10-001-workflow-diagnostics.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 10 — *Monitoring, Logging, and Debugging*, pages physiques PDF 245–268.
- **Statut :** pages du PDF vérifiées dans ChatGPT ; exemple non validé en production.

## Lot 3C4 — Dix nouveaux chapitres ciblés

Les fiches suivantes ajoutent une couverture initiale de dix chapitres auparavant uniquement cartographiés. [Rapport de sources et tests](validation/batch-3c4-source-and-typechecks.md) ; [exemples](examples/validated-contracts-3c4.ts) et [vérifications automatisables](examples/validated-contracts-3c4.test.ts).

### TS03-001 — Séparer vérification des types, compilation et exécution

- **Problème :** Un développeur croit que le navigateur exécute directement des fichiers TypeScript, ou confond compilation, assemblage et tests.
- **Mots-clés :** TypeScript, tsc, transpilation, noEmit, build, bundler, CI.
- **Fiche :** [TS03-001](concepts/language-and-types/TS03-001-typecheck-and-build.md).
- **Livre :** `SRC-001` / `TS-2026`, chapitre 3 — *TypeScript in the Development Pipeline* ; pages PDF inspectées : 54, 55, 56, 58, 59..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### TS07-001 — Distinguer readonly au compilateur et immutabilité réelle

- **Problème :** Une fonction modifie involontairement un tableau fourni par son appelant ; une configuration annotée `readonly` est supposée figée à l’exécution.
- **Mots-clés :** readonly, as const, Object.freeze, mutabilité, API, types littéraux.
- **Fiche :** [TS07-001](concepts/language-and-types/TS07-001-readonly-contracts.md).
- **Livre :** `SRC-001` / `TS-2026`, chapitre 7 — *Mutability* ; pages PDF inspectées : 169, 170, 174, 175, 180, 181, 185, 187..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### FULL12-001 — Mettre la connexion et les services MongoDB derrière une frontière

- **Problème :** Les composants et résolveurs interrogent MongoDB directement, chacun recréant la connexion et les règles métier.
- **Mots-clés :** Next.js, MongoDB, Mongoose, service, connexion, modèle, middleware.
- **Fiche :** [FULL12-001](concepts/backend-and-apis/FULL12-001-database-services.md).
- **Livre :** `SRC-002` / `FULL-2024`, chapitre 12 — *Building the Middleware* ; pages PDF inspectées : 225, 227, 228, 230, 232, 234, 235..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### FULL13-001 — Assembler schémas GraphQL et résolveurs sans contourner les autorisations

- **Problème :** Une API GraphQL regroupe tous les types et résolveurs dans un fichier géant, ou autorise une mutation simplement parce que le client fournit un identifiant.
- **Mots-clés :** GraphQL, schema, query, mutation, resolver, OAuth, service.
- **Fiche :** [FULL13-001](concepts/backend-and-apis/FULL13-001-modular-graphql-resolvers.md).
- **Livre :** `SRC-002` / `FULL-2024`, chapitre 13 — *Building the GraphQL API* ; pages PDF inspectées : 237, 238, 239, 240, 241, 242, 243..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### NEXT04-001 — Construire une route API qui valide ses entrées côté serveur

- **Problème :** Une application accepte des paramètres HTTP non contrôlés et expose des clés API à son navigateur.
- **Mots-clés :** Next.js, API route, pages/api, GET, POST, JSON, validation, BFF.
- **Fiche :** [NEXT04-001](concepts/backend-and-apis/NEXT04-001-api-route-validation.md).
- **Livre :** `SRC-003` / `NEXT-2026`, chapitre 4 — *API Routes in Next.js* ; pages PDF inspectées : 100, 102, 103, 106, 108, 115, 116..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### NEXT11-001 — Préparer le déploiement Next.js avec vérifications et rollback

- **Problème :** Une application passe du poste développeur en production sans vérification de la compilation, des variables d’environnement ou de la surveillance.
- **Mots-clés :** Next.js, déploiement, build, hosting, Vercel, CDN, rollback, monitoring.
- **Fiche :** [NEXT11-001](concepts/architecture-and-devops/NEXT11-001-deployment-readiness.md).
- **Livre :** `SRC-003` / `NEXT-2026`, chapitre 11 — *Deploying Next.js Applications* ; pages PDF inspectées : 265, 266, 267, 269, 272, 275, 282, 283..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### VUE04-001 — Extraire les appels API d’un composant Vue vers des composables

- **Problème :** Un composant Vue de recherche mélange formulaire, calcul de pagination, appels réseau, gestion du chargement et logique métier.
- **Mots-clés :** Vue 3, composable, ref, API, pagination, search, defineEmits.
- **Fiche :** [VUE04-001](concepts/frontend/VUE04-001-composables-api-search.md).
- **Livre :** `SRC-004` / `VUE-2024`, chapitre 4 — *Creating the Marvel Explorer App* ; pages PDF inspectées : 82, 89, 92, 97, 101, 107, 108..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### VUE09-001 — Encadrer la reconnaissance d’objets et les limites d’un modèle prêt à l’emploi

- **Problème :** Une application affiche une étiquette produite par un modèle de reconnaissance comme si elle constituait une identification certaine.
- **Mots-clés :** Vue, TensorFlow.js, COCO-SSD, reconnaissance objets, confiance, limites, webcam.
- **Fiche :** [VUE09-001](concepts/ai-and-frontend/VUE09-001-browser-object-detection.md).
- **Livre :** `SRC-004` / `VUE-2024`, chapitre 9 — *Experimental Object Recognition with TensorFlow* ; pages PDF inspectées : 244, 245, 246, 247, 248, 250, 254, 260, 266..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### GHA06-001 — Isoler variables, secrets et approbations par environnement GitHub

- **Problème :** Un workflow traite des secrets de production comme de simples variables de configuration, ou permet à toutes les branches de déployer.
- **Mots-clés :** GitHub Actions, environment, vars, secrets, approvals, GITHUB_TOKEN.
- **Fiche :** [GHA06-001](concepts/devops/GHA06-001-environments-and-secrets.md).
- **Livre :** `SRC-005` / `GHA-2023`, chapitre 6 — *Managing Your Workflow Environments* ; pages PDF inspectées : 113, 115, 118, 121, 125, 126, 128, 132, 134, 137..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

### GHA11-001 — Factoriser un workflow en action composite locale

- **Problème :** Plusieurs pipelines répètent les mêmes étapes de contrôle et se contredisent progressivement.
- **Mots-clés :** GitHub Actions, action.yml, composite, inputs, outputs, reusable workflow.
- **Fiche :** [GHA11-001](concepts/devops/GHA11-001-local-composite-actions.md).
- **Livre :** `SRC-005` / `GHA-2023`, chapitre 11 — *Creating Custom actions* ; pages PDF inspectées : 281, 282, 283, 285, 286, 289, 310, 312, 313..
- **Limite :** lecture ciblée seulement, pas analyse exhaustive du chapitre ni application validée.

## Lot 3C5 — Onze nouvelles fiches et parcours transversal

Ces fiches portent la bibliothèque à 56 entrées sur 51 chapitres partiellement analysés. Les références PDF ont été vérifiées dans l'environnement source privé. Le [guide de conception d'une réservation](playbooks/reservation-system-cross-book.md) montre un usage inter-ouvrages. [Rapport d'audit](validation/batch-3c5-source-audit.md) et [exemple TypeScript testé](examples/reservation-contracts-3c5.ts).

### FULL11-001 — Orchestration des services de développement avec Docker Compose

- **Problème :** Le frontend, l’API et MongoDB fonctionnent chacun sur la machine du développeur mais se connectent mal entre eux ou perdent leurs données.
- **Mots-clés :** Docker Compose, volumes, services, MongoDB, base de développement, variables environnement.
- **Fiche :** [FULL11-001](concepts/architecture-and-devops/FULL11-001-compose-service-topology.md).
- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`, chapitre 11 — *Setting Up the Docker Environment*, pages PDF 216–223 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### GHA12-001 — Workflows réutilisables et contrats entre dépôts

- **Problème :** Plusieurs dépôts doivent exécuter le même contrôle de qualité, mais copier-coller le YAML partout empêche les mises à jour cohérentes.
- **Mots-clés :** GitHub Actions, workflow_call, workflow_dispatch, workflow_run, inputs, secrets, outputs.
- **Fiche :** [GHA12-001](concepts/devops/GHA12-001-reusable-workflows.md).
- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`, chapitre 12 — *Advanced Workflows*, pages PDF 322–329 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### GHA13-001 — Matrices de jobs, exclusions et pression sur les runners

- **Problème :** Tester plusieurs versions d’un runtime et plusieurs systèmes d’exploitation sans dupliquer chaque job ni saturer la capacité des runners.
- **Mots-clés :** GitHub Actions, strategy matrix, include, exclude, fail-fast, max-parallel.
- **Fiche :** [GHA13-001](concepts/devops/GHA13-001-job-matrix-design.md).
- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`, chapitre 13 — *Advanced Workflow Techniques*, pages PDF 344–352 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### NEXT08-001 — Choisir état local, partagé ou issu du serveur

- **Problème :** Un projet Next.js mélange données serveur, état d’interface et panier global, créant duplications et comportements incohérents après actualisation.
- **Mots-clés :** useState, useReducer, Context API, Redux Toolkit, SSR, hydratation, Pages Router.
- **Fiche :** [NEXT08-001](concepts/frontend/NEXT08-001-client-vs-server-state.md).
- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`, chapitre 8 — *State Management in Next.js*, pages PDF 212–226 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### NEXT12-001 — Réécritures de routes, locales et limites du runtime Edge

- **Problème :** Un site multilingue veut rediriger les utilisateurs et filtrer certaines routes, sans confondre routage et sécurité métier.
- **Mots-clés :** Next.js, middleware, rewrite, locale, edge runtime, matcher, internationalisation.
- **Fiche :** [NEXT12-001](concepts/frontend/NEXT12-001-middleware-locales-edge.md).
- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`, chapitre 12 — *Advanced Features in Next.js*, pages PDF 287–290, 295–304 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### VUE01-001 — Structure d’une application Vue et outillage de développement

- **Problème :** Une équipe débute une application Vue et confond point de montage, composants SFC, dossiers sources et ressources publiques.
- **Mots-clés :** Vue 3, Vite, TypeScript, IDE, DevTools, SFC, main.ts, App.vue.
- **Fiche :** [VUE01-001](concepts/frontend/VUE01-001-vue-project-structure.md).
- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`, chapitre 1 — *Introduction to Vue.js*, pages PDF 26–33 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### VUE02-001 — Réactivité Vue, liste dérivée et stockage local

- **Problème :** Une liste de tâches doit réagir aux changements de l’utilisateur, afficher un ordre dérivé et conserver une copie locale après rechargement.
- **Mots-clés :** Vue 3, ref, computed, watch, onMounted, localStorage, tri.
- **Fiche :** [VUE02-001](concepts/frontend/VUE02-001-vue-reactivity-localstorage.md).
- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`, chapitre 2 — *Creating a Todo List App*, pages PDF 40–47 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### VUE05-002 — Composants Vuetify et dialogue de recherche découplé

- **Problème :** Une interface calendrier doit ouvrir un dialogue de recherche, choisir un élément puis mettre à jour la journée sélectionnée sans rendre les composants interdépendants.
- **Mots-clés :** Vue 3, Vuetify, defineEmits, v-dialog, debounce, recherche, props.
- **Fiche :** [VUE05-002](concepts/frontend/VUE05-002-vuetify-dialog-events.md).
- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`, chapitre 5 — *Building a Recipe App with Vuetify*, pages PDF 117–128 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### TS12-001 — Contrats de callbacks et unions de fonctions

- **Problème :** Une bibliothèque d’événements reçoit des callbacks avec un nombre variable de paramètres ; une union de signatures peut casser l’inférence du callback.
- **Mots-clés :** TypeScript, fonction callback, assignabilité, paramètres ignorés, union de fonctions.
- **Fiche :** [TS12-001](concepts/language-and-types/TS12-001-callback-assignability.md).
- **Catalogue / cartographie :** `SRC-001` / `TS-2026`, chapitre 12 — *The Weird Parts*, pages PDF 295–298 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### TS13-001 — Fichiers de déclaration et frontière TypeScript–JavaScript

- **Problème :** Une API JavaScript ancienne ou un module tiers est utilisable à l’exécution, mais ne fournit pas de contrat de types fiable.
- **Mots-clés :** TypeScript, d.ts, declare module, global, moduleDetection, interfaces.
- **Fiche :** [TS13-001](concepts/language-and-types/TS13-001-declaration-files.md).
- **Catalogue / cartographie :** `SRC-001` / `TS-2026`, chapitre 13 — *Modules, Scripts, and Declaration Files*, pages PDF 316–324 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

### FULL15-001 — Session OAuth et autorisation effective des mutations GraphQL

- **Problème :** Un utilisateur est connecté à l’interface, mais une mutation GraphQL reste accessible si elle n’effectue pas son contrôle d’autorisation côté serveur.
- **Mots-clés :** OAuth, Auth.js, session, GraphQL, resolver, authGuard, autorisation, wishlist.
- **Fiche :** [FULL15-001](concepts/security/FULL15-001-oauth-session-graphql-guard.md).
- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`, chapitre 15 — *Adding OAuth*, pages PDF 262–265, 277–281 (numérotation à partir de 1, non identique à la pagination imprimée)..
- **Statut :** lecture ciblée, pas analyse intégrale du chapitre ; exemples à valider en conditions réelles.

## Étape 3C6 — Couverture documentaire initiale des 70 chapitres

Chacun des 70 chapitres cartographiés dispose maintenant d'au moins une fiche. **Couverture de présence, non couverture exhaustive du contenu !** Le nombre de fiches passe à **75**. Voir [le rapport de contrôle](validation/batch-3c6-70-chapter-audit.md) et [le script vérifiant le catalogue](../scripts/verify_chapter_coverage.py).

### TS01-001 — Boucle IDE, types et JavaScript produit

- **Fiche :** [TS01-001](concepts/language-and-types/TS01-001-feedback-loop.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 1, *Kickstart Your TypeScript Setup*, pages physiques 33, 34, 35.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### TS02-001 — Exploiter autocomplétion et diagnostics IDE

- **Fiche :** [TS02-001](concepts/language-and-types/TS02-001-ide-feedback-and-refactoring.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 2, *IDE Superpowers*, pages physiques 39, 40, 41, 42.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### TS04-001 — Choisir annotation explicite et inférence

- **Fiche :** [TS04-001](concepts/language-and-types/TS04-001-annotation-versus-inference.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 4, *Essential Types and Annotations*, pages physiques 63, 64, 65, 66.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### TS08-001 — Initialisation des classes et contrat instance

- **Fiche :** [TS08-001](concepts/language-and-types/TS08-001-class-constructor-contract.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 8, *Classes*, pages physiques 189, 190, 191, 192.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### TS09-001 — Comprendre le coût runtime des enums

- **Fiche :** [TS09-001](concepts/language-and-types/TS09-001-enum-runtime-tradeoffs.md).
- **Source :** `SRC-001` / `TS-2026`, chapitre 9, *TypeScript-Only Features*, pages physiques 211, 212, 213, 214.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL01-001 — Démarrer un service Node avec manifeste reproductible

- **Fiche :** [FULL01-001](concepts/architecture-and-devops/FULL01-001-node-project-manifest.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 1, *Node.js*, pages physiques 33, 34, 35, 36.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL02-001 — ES modules pour frontières maintenables

- **Fiche :** [FULL02-001](concepts/architecture-and-devops/FULL02-001-es-modules-boundaries.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 2, *Modern Javascript*, pages physiques 45, 46, 47.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL03-001 — TypeScript pour repérer tôt des erreurs de types

- **Fiche :** [FULL03-001](concepts/architecture-and-devops/FULL03-001-static-type-boundary.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 3, *Typescript*, pages physiques 63, 64, 65.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL04-001 — Décomposer une interface React déclarative

- **Fiche :** [FULL04-001](concepts/architecture-and-devops/FULL04-001-react-declarative-components.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 4, *React*, pages physiques 83, 84, 85, 86.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL05-001 — Comprendre la structure Next.js Pages Router

- **Fiche :** [FULL05-001](concepts/architecture-and-devops/FULL05-001-nextjs-pages-routing-boundary.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 5, *Next.js*, pages physiques 99, 100, 101, 102.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### FULL14-001 — Assembler le frontend du projet full-stack

- **Fiche :** [FULL14-001](concepts/architecture-and-devops/FULL14-001-frontend-components-integration.md).
- **Source :** `SRC-002` / `FULL-2024`, chapitre 14, *Building the Frontend*, pages physiques 245, 246, 247, 248.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### NEXT01-001 — Cadrer React, Next.js et initialisation du projet

- **Fiche :** [NEXT01-001](concepts/frontend/NEXT01-001-react-framework-bootstrap.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 1, *Getting Started with Next.js*, pages physiques 27, 28, 29, 30.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### NEXT07-001 — Distinguer styles globaux et CSS Modules

- **Fiche :** [NEXT07-001](concepts/frontend/NEXT07-001-global-vs-module-css.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 7, *Styling in Next.js*, pages physiques 189, 190, 191, 192.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### NEXT13-001 — Cartographier les flux d’un projet e-commerce et CMS

- **Fiche :** [NEXT13-001](concepts/frontend/NEXT13-001-commerce-blog-dataflows.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 13, *Real-World Projects with Next.js*, pages physiques 307, 308, 309, 310.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### NEXT14-001 — Transformer un portfolio développeur en preuves vérifiables

- **Fiche :** [NEXT14-001](concepts/frontend/NEXT14-001-portfolio-evidence-for-developers.md).
- **Source :** `SRC-003` / `NEXT-2026`, chapitre 14, *Preparing for Front-End Development Jobs*, pages physiques 331, 332, 333, 334.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### GHA01-001 — Choisir quand automatiser avec GitHub Actions

- **Fiche :** [GHA01-001](concepts/devops/GHA01-001-automation-event-fit.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 1, *The Basics*, pages physiques 25, 26, 27, 28.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### GHA02-001 — Comprendre événement, workflow, job et step

- **Fiche :** [GHA02-001](concepts/devops/GHA02-001-events-jobs-steps.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 2, *How Does Actions Work?*, pages physiques 37, 38, 39, 40.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### GHA03-001 — Lire les contrats action.yml avant de réutiliser une action

- **Fiche :** [GHA03-001](concepts/devops/GHA03-001-action-metadata-contract.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 3, *What’s in an action?*, pages physiques 47, 48, 49, 50, 53.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.

### GHA14-001 — Migrer progressivement une CI existante vers GitHub Actions

- **Fiche :** [GHA14-001](concepts/devops/GHA14-001-legacy-ci-migration-audit.md).
- **Source :** `SRC-005` / `GHA-2023`, chapitre 14, *Migrating to GitHub Actions*, pages physiques 359, 360, 361, 362.
- **Statut :** premier examen ciblé, sans prétendre à une lecture complète du chapitre ; tests applicatifs non exécutés.
