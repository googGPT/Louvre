# Lot 3C6 — Couverture initiale de l'ensemble des chapitres

**Date :** 25 octobre 2026. **Statut :** recherche documentaire ciblée ; chapitres **non étudiés intégralement**.

## Protocole réel

- Ouvrir les cinq PDF privés disponibles dans la conversation.
- Comparer les fichiers aux SHA-256 déjà documentés dans la cartographie du dépôt.
- Repérer les 19 chapitres sans fiche, ouvrir 3 à 5 pages précisément identifiées par chapitre, contrôler que leur texte est disponible et correspond à la structure annoncée.
- Distinguer **faits présentés par le livre**, **interprétation Louvre**, **conditions d'application** et **tests encore à réaliser**.
- Ne publier dans GitHub que nos notes originales, jamais les PDF ou de longs extraits de leurs textes.

Les pages sont numérotées physiquement à partir de 1, et non selon une pagination imprimée supposée. Nous ne certifions pas le fonctionnement du code futur. Les chapitres possédant une fiche peuvent encore contenir des détails, schémas, mises en garde ou exercices non lus.

## Chapitres ciblés

| ID | Ouvrage source | Chapitre | Pages effectivement examinées | Fiche |
|---|---|---:|---|---|
| `TS01-001` | `SRC-001` | 1 | 33,34,35 | [TS01-001](../concepts/language-and-types/TS01-001-feedback-loop.md) |
| `TS02-001` | `SRC-001` | 2 | 39,40,41,42 | [TS02-001](../concepts/language-and-types/TS02-001-ide-feedback-and-refactoring.md) |
| `TS04-001` | `SRC-001` | 4 | 63,64,65,66 | [TS04-001](../concepts/language-and-types/TS04-001-annotation-versus-inference.md) |
| `TS08-001` | `SRC-001` | 8 | 189,190,191,192 | [TS08-001](../concepts/language-and-types/TS08-001-class-constructor-contract.md) |
| `TS09-001` | `SRC-001` | 9 | 211,212,213,214 | [TS09-001](../concepts/language-and-types/TS09-001-enum-runtime-tradeoffs.md) |
| `FULL01-001` | `SRC-002` | 1 | 33,34,35,36 | [FULL01-001](../concepts/architecture-and-devops/FULL01-001-node-project-manifest.md) |
| `FULL02-001` | `SRC-002` | 2 | 45,46,47 | [FULL02-001](../concepts/architecture-and-devops/FULL02-001-es-modules-boundaries.md) |
| `FULL03-001` | `SRC-002` | 3 | 63,64,65 | [FULL03-001](../concepts/architecture-and-devops/FULL03-001-static-type-boundary.md) |
| `FULL04-001` | `SRC-002` | 4 | 83,84,85,86 | [FULL04-001](../concepts/architecture-and-devops/FULL04-001-react-declarative-components.md) |
| `FULL05-001` | `SRC-002` | 5 | 99,100,101,102 | [FULL05-001](../concepts/architecture-and-devops/FULL05-001-nextjs-pages-routing-boundary.md) |
| `FULL14-001` | `SRC-002` | 14 | 245,246,247,248 | [FULL14-001](../concepts/architecture-and-devops/FULL14-001-frontend-components-integration.md) |
| `NEXT01-001` | `SRC-003` | 1 | 27,28,29,30 | [NEXT01-001](../concepts/frontend/NEXT01-001-react-framework-bootstrap.md) |
| `NEXT07-001` | `SRC-003` | 7 | 189,190,191,192 | [NEXT07-001](../concepts/frontend/NEXT07-001-global-vs-module-css.md) |
| `NEXT13-001` | `SRC-003` | 13 | 307,308,309,310 | [NEXT13-001](../concepts/frontend/NEXT13-001-commerce-blog-dataflows.md) |
| `NEXT14-001` | `SRC-003` | 14 | 331,332,333,334 | [NEXT14-001](../concepts/frontend/NEXT14-001-portfolio-evidence-for-developers.md) |
| `GHA01-001` | `SRC-005` | 1 | 25,26,27,28 | [GHA01-001](../concepts/devops/GHA01-001-automation-event-fit.md) |
| `GHA02-001` | `SRC-005` | 2 | 37,38,39,40 | [GHA02-001](../concepts/devops/GHA02-001-events-jobs-steps.md) |
| `GHA03-001` | `SRC-005` | 3 | 47,48,49,50,53 | [GHA03-001](../concepts/devops/GHA03-001-action-metadata-contract.md) |
| `GHA14-001` | `SRC-005` | 14 | 359,360,361,362 | [GHA14-001](../concepts/devops/GHA14-001-legacy-ci-migration-audit.md) |

## Contrôles structurels

1. `python3 scripts/validate_library.py` : absence de fiches non indexées, liens locaux invalides, identifiants dupliqués, PDF accidentellement publiés.
2. `python3 scripts/verify_chapter_coverage.py` : au moins une fiche par chapitre des cinq livres (16 + 16 + 14 + 10 + 14 = 70), sans prétention d'étude exhaustive.
3. CI sur la Pull Request : la réussite doit être observée sur le SHA final ; un script vert ne remplace pas la vérification de la pertinence scientifique, documentaire ou logicielle.

**Contrôles non effectués :** tests runtime des idées nouvelles, mise à niveau des bibliothèques de 2023–2026, simulation de sécurité ou de concurrence, audit complet des 70 chapitres.