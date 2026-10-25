# Index de consultation Louvre

Lire cet index avant de sélectionner une fiche. Rechercher un problème ou un mot-clé, puis ouvrir uniquement les fiches utiles. Les chemins ci-dessous sont exacts depuis la racine du dépôt ; les liens sont relatifs à cet index.

## Couverture et validation communes

Cinq fiches uniquement, issues de *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026), catalogue `SRC-001`, cartographie `TS-2026`, chapitre 15, *Designing Your Types*. Les 70 chapitres sont cartographiés, sans être tous analysés ; les 69 autres chapitres restent uniquement indexés. Le chapitre 15 n'est pas couvert exhaustivement.

Pour chacune des cinq fiches : consultation du PDF et succès statique sous TypeScript 5.8.3 / Node.js 22.16.0 **rapportés par l'environnement source ChatGPT**. Ni PDF consulté ni compilation reproduite dans Codex lors de l'intégration. Aucun test runtime ou d'intégration applicative ; autres versions non validées. Les pages sont les pages physiques PDF, base 1, documentées dans les fiches et non revérifiées ici. Voir le [rapport](validation/TS15-static-typecheck.md) et l'[exemple original](examples/type-patterns.ts) si nécessaire.

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

## Connaissances absentes

Aucune fiche approfondie GitHub Actions (`GHA-2023`), Vue.js (`VUE-2024`), Next.js (`NEXT-2026`) ou *The Complete Developer* (`FULL-2024`). Leurs cartographies sont des inventaires, pas des preuves d'une technique ni des extractions. Aucun concept hors des cinq entrées n'est couvert par une fiche à ce jour.

Si aucune entrée ne convient, signaler cette absence. Une recommandation externe reste possible selon la demande, en étant explicitement séparée des connaissances Louvre et sans citation inventée. Une citation textuelle exacte non disponible ne peut pas être reconstituée depuis une synthèse.

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
