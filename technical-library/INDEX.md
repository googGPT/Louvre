# Index de consultation Louvre

Trouver un concept par son problème ou ses mots-clés, puis consulter uniquement les fiches pertinentes.

## Couverture vérifiée au 25 octobre 2026

- **35 fiches techniques distinctes**, réparties sur les cinq ouvrages.
- **70 chapitres cartographiés** ; **31 possèdent au moins une fiche**, sans couverture exhaustive.
- **39 chapitres restent uniquement cartographiés**.
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
