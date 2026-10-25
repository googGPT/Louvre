# Lot 3C5 — Audit de provenance des onze fiches additionnelles

- **Date de préparation :** 25 octobre 2026.
- **Entrée :** cinq PDF privés ; empreintes SHA-256 confrontées aux cartographies du dépôt.
- **Méthode :** extraction avec PyMuPDF ciblée sur les pages citées et inspection du texte. Les sections citées ne représentent pas la totalité des chapitres ; ne pas extrapoler.
- **Sortie :** onze fiches autonomes, un parcours transversal et ce rapport. Aucun livre PDF ni citation longue n'est publié dans le dépôt.

| Fiche | Chapitre de l’ouvrage | Pages physiques PDF ciblées | Chemin |
|---|---|---|---|
| `TS12-001` | TS chapitre 12 | 295–298 | `technical-library/concepts/language-and-types/TS12-001-callback-assignability.md` |
| `TS13-001` | TS chapitre 13 | 316–324 | `technical-library/concepts/language-and-types/TS13-001-declaration-files.md` |
| `FULL11-001` | FULL chapitre 11 | 216–223 | `technical-library/concepts/architecture-and-devops/FULL11-001-compose-service-topology.md` |
| `FULL15-001` | FULL chapitre 15 | 262–265, 277–281 | `technical-library/concepts/security/FULL15-001-oauth-session-graphql-guard.md` |
| `NEXT08-001` | NEXT chapitre 8 | 212–226 | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` |
| `NEXT12-001` | NEXT chapitre 12 | 287–290, 295–304 | `technical-library/concepts/frontend/NEXT12-001-middleware-locales-edge.md` |
| `VUE02-001` | VUE chapitre 2 | 40–47 | `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md` |
| `VUE05-002` | VUE chapitre 5 | 117–128 | `technical-library/concepts/frontend/VUE05-002-vuetify-dialog-events.md` |
| `GHA12-001` | GHA chapitre 12 | 322–329 | `technical-library/concepts/devops/GHA12-001-reusable-workflows.md` |
| `GHA13-001` | GHA chapitre 13 | 344–352 | `technical-library/concepts/devops/GHA13-001-job-matrix-design.md` |
| `VUE01-001` | VUE chapitre 1 | 26–33 | `technical-library/concepts/frontend/VUE01-001-vue-project-structure.md` |

## Différencier les preuves

- **Lecture des sources :** vérifiée aux pages ciblées dans l’environnement ChatGPT ; aucune lecture des PDF par Codex ou par la CI.
- **Code des fiches :** exemples originaux proposés pour faciliter la transposition ; compilation/runtime à faire explicitement s'ils sont réutilisés.
- **Exemple autonome 3C5 :** `reservation-contracts-3c5.ts` et ses tests ont été compilés localement avec TypeScript 5.8.3 (`--strict --target ES2022 --module commonjs`) ; 9 scénarios ont été exécutés sous Node.js 22.16.0 et ont réussi. Ces tests portent uniquement sur validation du payload et extraction de l’identité de session, **pas** sur la réservation atomique, les accès concurrents, une intégration Next.js ou les frameworks des ouvrages.
- **Workflow GitHub :** le contrôle documentaire automatique peut confirmer les liens, identifiants et fichiers accessibles. Son résultat ne certifie pas l'exactitude des conseils ni la sécurité d'une future application.
- **Compatibilité courante :** les versions et conventions de Next.js, Auth.js, Vue, Docker et GitHub Actions peuvent différer du contenu des éditions 2023–2026. Avant tout projet réel, vérifier la documentation officielle et écrire des tests d'intégration.
- **Couverture :** avec ce lot, 56 fiches et 51 chapitres avec au moins une fiche sont attendus **après fusion du lot et des changements déjà présents sur la PR #4**. Les 19 autres chapitres restent cartographiés uniquement.

## Contrôles à renseigner après la publication

- Contrôle structurel local : voir sortie d'exécution distincte.
- Contrôle GitHub Actions : attendre sa conclusion sur le dernier commit.
- Test runtime de l'exemple autonome : **9/9 scénarios de validation d'entrée et d'identité ont réussi** localement ; aucune base ni serveur réel et **aucun test de réservation concurrente** n'ont été exécutés.