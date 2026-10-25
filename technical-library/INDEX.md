# Index de consultation Louvre

Lire cet index avant de sélectionner une fiche. Rechercher un problème ou un mot-clé, puis ouvrir uniquement les fiches utiles. Les chemins ci-dessous sont exacts depuis la racine du dépôt ; les liens sont relatifs à cet index.

## Couverture et provenance

La bibliothèque compte **25 fiches** documentant **21 chapitres distincts partiellement** sur les **70 chapitres** cartographiés. Cinq fiches proviennent du premier pilote, dix du lot 3C1 et dix du lot 3C2. Les pages référencées sont les pages physiques PDF, pas la pagination imprimée.

Les synthèses documentaires ont été préparées dans l'environnement ChatGPT à partir des PDF privés. La disponibilité d'une fiche dans Codex ne signifie pas que Codex a consulté le PDF ou que ses exemples sont tous exécutés. Les techniques actuelles doivent être recoupées avec la documentation des outils réellement utilisés. Voir [catalogue](SOURCES.md) et [rapport 3C2](validation/batch-3c2-verified-source-notes.md).

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

À l'issue du lot 3C1, Louvre comptait **15 fiches distinctes** portant sur **11 chapitres partiellement couverts** ; ce paragraphe conserve l'historique de ce lot. Chaque référence de page ci-dessous vient d'une analyse des PDF réalisée dans l'environnement source ChatGPT ; elle n'implique ni tests applicatifs ni analyse exhaustive du chapitre. Le Skills peut sélectionner directement les fiches liées.

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

## Extension 3C2 — Dix nouveaux chapitres représentés

### TS14-001 — strict compiler config

- **Fiche :** [TS14-001](concepts/language-and-types/TS14-001-strict-compiler-config.md).
- **Source :** `SRC-001`, chapitre 14 ; pages PDF 337–346.
- **Recherche :** tsconfig, strict, noUncheckedIndexedAccess, undefined.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### TS16-001 — runtime type guards

- **Fiche :** [TS16-001](concepts/language-and-types/TS16-001-runtime-type-guards.md).
- **Source :** `SRC-001`, chapitre 16 ; pages PDF 396–400.
- **Recherche :** type predicate, assertion, unknown, runtime validation.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### FULL07-001 — mongoose schema boundary

- **Fiche :** [FULL07-001](concepts/backend-and-apis/FULL07-001-mongoose-schema-boundary.md).
- **Source :** `SRC-002`, chapitre 7 ; pages PDF 145–153.
- **Recherche :** MongoDB, Mongoose, schema, CRUD, repository.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### FULL09-001 — oauth delegation flow

- **Fiche :** [FULL09-001](concepts/security/FULL09-001-oauth-delegation-flow.md).
- **Source :** `SRC-002`, chapitre 9 ; pages PDF 187–201.
- **Recherche :** OAuth, callback, tokens, JWT, claims.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### NEXT05-001 — authorization server checks

- **Fiche :** [NEXT05-001](concepts/security/NEXT05-001-authorization-server-checks.md).
- **Source :** `SRC-003`, chapitre 5 ; pages PDF 127–141.
- **Recherche :** Next.js, authentication, authorization, sessions.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### NEXT09-001 — image and cache performance

- **Fiche :** [NEXT09-001](concepts/frontend/NEXT09-001-image-and-cache-performance.md).
- **Source :** `SRC-003`, chapitre 9 ; pages PDF 230–242.
- **Recherche :** Next.js, images, Lighthouse, cache, ISR.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### VUE03-001 — async api and geolocation

- **Fiche :** [VUE03-001](concepts/frontend/VUE03-001-async-api-and-geolocation.md).
- **Source :** `SRC-004`, chapitre 3 ; pages PDF 52–65.
- **Recherche :** Vue, fetch, geolocation, weather, async.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### VUE07-001 — multiplatform quasar supabase

- **Fiche :** [VUE07-001](concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md).
- **Source :** `SRC-004`, chapitre 7 ; pages PDF 186–202.
- **Recherche :** Vue, Quasar, Electron, Supabase.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### GHA04-001 — workflow trigger design

- **Fiche :** [GHA04-001](concepts/devops/GHA04-001-workflow-trigger-design.md).
- **Source :** `SRC-005`, chapitre 4 ; pages PDF 59–75.
- **Recherche :** GitHub Actions, CI, workflows, triggers.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

### GHA08-001 — concurrency groups

- **Fiche :** [GHA08-001](concepts/devops/GHA08-001-concurrency-groups.md).
- **Source :** `SRC-005`, chapitre 8 ; pages PDF 169–180.
- **Recherche :** GitHub Actions, concurrency, cancel-in-progress.
- **Validation :** synthèse sur PDF documentée, application du pattern à tester séparément.

## À consulter avant utilisation

Pour une question non couverte, signaler l'absence ; le nombre de fiches n'est pas un taux de lecture complète. Ne pas attribuer les adaptations Louvre à l'auteur ; signaler toute version logicielle non validée. Le [validateur documentaire](../scripts/validate_library.py) contrôle uniquement les liens et la structure, pas les conclusions techniques.
