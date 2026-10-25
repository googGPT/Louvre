# Louvre — Bibliothèque technique pour Codex

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026 — 56 fiches

- **56 fiches de connaissances** réparties sur les cinq livres, couvrant partiellement **51 chapitres des 70 cartographiés** ; 19 chapitres restent sans fiche.
- Le lot 3C5 ajoute **11 fiches** (10 chapitres jusque-là sans fiche et une nouvelle analyse de Vue chapitre 5) et un [parcours transversal pour une application de réservation](technical-library/playbooks/reservation-system-cross-book.md).
- Les PDF source sont privés et non publiés. La provenance, les numéros physiques et les limites sont documentés dans chaque fiche.
- **Vérifications :** [GitHub Actions](.github/workflows/knowledge-integrity.yml) contrôle les liens/identifiants et compile les exemples TypeScript des lots 3C3 à 3C5. La réussite doit être constatée sur la dernière exécution, et ne garantit pas de déploiement applicatif.
- Le nouvel [exemple autonome](technical-library/examples/reservation-contracts-3c5.ts) a été compilé avec TypeScript 5.8.3 et passé **9 tests de logique métier sous Node.js 22.16.0** en local ; il ne gère pas la disponibilité atomique des stocks.
- Codex peut consulter les fiches en lisant `AGENTS.md` puis `technical-library/INDEX.md` même si la découverte automatique du Skill n'est pas disponible.

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
