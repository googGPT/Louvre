# Étape 3 — Pilote d'extraction vérifiée (`TS-2026`, chapitre 15)

Ce paquet contient cinq fiches **originales** déduites d'une consultation effective du PDF privé de *Total TypeScript: The Essentials*, chapitre 15, pages physiques 362 à 387. Il ne contient aucun PDF ni reproduction extensive du livre.

## Provenance lors de l'intégration Codex

Les affirmations de consultation du PDF, de vérification de son empreinte et de compilation ci-dessous sont celles du livrable source ChatGPT fourni par l'utilisateur. Elles ne décrivent pas des opérations effectuées dans cette conversation Codex. Ici, le PDF n'est pas accessible et TypeScript n'est pas installé localement ; les résultats statiques source sont conservés sans reproduction. Node.js disponible ici : `v24.19.0`. Voir le [rapport](technical-library/validation/TS15-static-typecheck.md).

## Fichiers

- [technical-library/concepts/language-and-types/TS15-001-generic-types.md](technical-library/concepts/language-and-types/TS15-001-generic-types.md)
- [technical-library/concepts/language-and-types/TS15-002-template-literals.md](technical-library/concepts/language-and-types/TS15-002-template-literals.md)
- [technical-library/concepts/language-and-types/TS15-003-conditional-types.md](technical-library/concepts/language-and-types/TS15-003-conditional-types.md)
- [technical-library/concepts/language-and-types/TS15-004-mapped-types.md](technical-library/concepts/language-and-types/TS15-004-mapped-types.md)
- [technical-library/concepts/language-and-types/TS15-005-result-errors.md](technical-library/concepts/language-and-types/TS15-005-result-errors.md)
- [technical-library/examples/type-patterns.ts](technical-library/examples/type-patterns.ts) (démonstration originale)
- [technical-library/validation/TS15-static-typecheck.md](technical-library/validation/TS15-static-typecheck.md) (validation exécutée dans l’environnement source ChatGPT)

## Provenance et portée

- Source catalogue existant : `SRC-001`; cartographie : `TS-2026`.
- PDF original vérifié par SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- Les **pages citées ont été ouvertes dans le PDF original** dans la conversation source ChatGPT le 25 octobre 2026, indépendamment de l'index des signets.
- Les fiches distinguent les faits du livre et les adaptations suggérées pour des applications.
- Compilateur TypeScript 5.8.3 local à l’environnement source ChatGPT : vérification statique réussie, sans exécution runtime.
- Les quatre autres ouvrages et les quinze autres chapitres de ce livre ne sont **pas** couverts par ce pilote.

## Intégration dans GitHub par Codex

Copier les fichiers du dossier `technical-library/` dans le dossier homonyme du dépôt, sans les PDF. Comparer au modèle de fiche actuel et adapter de façon conservatrice si nécessaire. Ne pas remplacer les instructions existantes du dépôt. Une fois publiés, ces documents pourront être indexés et consultés ; aucun Skill/RAG n'est installé par ce paquet.
