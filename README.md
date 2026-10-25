# Louvre — Bibliothèque technique pour Codex

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026 — 75 fiches ; 70/70 chapitres avec une première fiche

- **75 fiches techniques** issues des cinq ouvrages ; **chacun des 70 chapitres possède au moins une analyse ciblée**. Les livres ne sont pas étudiés intégralement.
- **Nouvelle étape 3C6 :** 19 premières fiches pour les chapitres auparavant uniquement cartographiés ; [rapport de provenance](technical-library/validation/batch-3c6-70-chapter-audit.md).
- **Contrôles structurels automatiques :** `scripts/validate_library.py` (liens, identifiants, absence de PDF) et `scripts/verify_chapter_coverage.py` (présence d'au moins une fiche pour chacun des 70 chapitres). La réussite doit être observée sur GitHub Actions pour le dernier commit.
- **Exemples exécutables :** les scripts et tests TypeScript des lots 3C3 à 3C5 sont contrôlés en CI, sans prouver que des applications Next.js, Vue ou Docker complètes fonctionnent.
- **Provenance :** chaque nouvelle fiche documente le SHA-256 du PDF privé, les pages réellement ouvertes, les adaptations Louvre et les limites. Les PDF ne sont pas publiés.
- **Utilisation dans Codex :** lire `AGENTS.md`, puis `technical-library/INDEX.md`, et seulement les fiches pertinentes ; ne pas confondre présence d'une fiche et compétence validée par un test d'intégration.

## Utiliser Louvre dans Codex

1. Lire [AGENTS.md](AGENTS.md) pour les règles de qualité, confidentialité et provenance.
2. Chercher dans [technical-library/INDEX.md](technical-library/INDEX.md) le problème ou les mots-clés pertinents.
3. Lire les seules fiches utiles, vérifier les limites, les versions et la source avant d'appliquer les principes.
4. Consulter les [exemples](technical-library/examples/) et les [rapports de validation](technical-library/validation/) pour distinguer code testé, non exécuté et documenté.

Le Skill facultatif est disponible dans [.agents/skills/louvre-technical-reference/SKILL.md](.agents/skills/louvre-technical-reference/SKILL.md) si le client peut le découvrir ; son absence du catalogue ne rend pas l'index inutilisable.

## Bibliographie et extraction

- [Catalogue des cinq livres](technical-library/SOURCES.md)
- [Cartographie des chapitres](technical-library/source-maps/README.md)
- [Modèle de fiche](technical-library/KNOWLEDGE-TEMPLATE.md)
- [Pilote initial](README-PILOT.md)
- [Rapport du lot multi-ouvrages](technical-library/validation/batch-3c1-source-and-static-checks.md)

## Règles

Aucun contenu substantiel d'ouvrage sous droit d'auteur n'est reproduit. Toute proposition issue d'une fiche doit distinguer les principes attribués à l'auteur de l'adaptation Louvre et de la documentation officielle plus récente. **Ne pas inventer** pages, tests, versions ou conclusions. Aucun changement de stack ne doit être imposé à un projet existant.

- [Rapport du lot 3C2](technical-library/validation/batch-3c2-verified-source-notes.md)

- [Rapport du lot 3C3](technical-library/validation/batch-3c3-source-audit.md)
- [Exemples typés et exécutés du lot 3C3](technical-library/examples/validated-contracts-3c3.ts)

- [Audit du lot 3C4](technical-library/validation/batch-3c4-source-and-typechecks.md)
- [Fonctions TypeScript testables 3C4](technical-library/examples/validated-contracts-3c4.ts) et [leurs cas de test](technical-library/examples/validated-contracts-3c4.test.ts)

- [Rapport lot 3C5](technical-library/validation/batch-3c5-source-audit.md)

- [Rapport de couverture initiale 70/70](technical-library/validation/batch-3c6-70-chapter-audit.md)
