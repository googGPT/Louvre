# Louvre — Bibliothèque technique pour Codex

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026 — 25 fiches

- **25 fiches techniques :** les 15 anciennes et 10 nouvelles (lot 3C2).
- **70 chapitres indexés**, dont **21 avec au moins une fiche** ; analyse non exhaustive.
- **5 livres représentés**, avec types, backend, authentification, performance, applications Vue et GitHub Actions.
- **Contrôle documentaire automatique :** [script de validation](scripts/validate_library.py) et [workflow GitHub Actions](.github/workflows/knowledge-integrity.yml). La CI doit être observée après publication.
- Les PDF originaux ne sont pas publiés ; les tests applicatifs des nouveaux exemples ne sont pas exécutés.
- Si le Skill n'est pas reconnu par Codex, utiliser directement AGENTS.md et INDEX.md.

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
