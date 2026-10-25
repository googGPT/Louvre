# Louvre — Bibliothèque technique pour Codex

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026 — 45 fiches

- **45 fiches techniques**, couvrant partiellement **41 des 70 chapitres** ; les 29 autres chapitres n'ont encore qu'une cartographie bibliographique.
- **Cinq ouvrages représentés**, avec des pages PDF physiquement vérifiées dans l'environnement source privé.
- **Provenance :** chaque fiche distingue contenu du livre, adaptation Louvre et limites. Les cinq PDF et les passages substantiels ne sont jamais publiés ici.
- **Validation documentaire :** `python3 scripts/validate_library.py` est exécuté via GitHub Actions à chaque Pull Request.
- **Validation TypeScript :** le workflow ajoute des contrôles stricts de compilation et des tests déterministes sur les exemples 3C3 et 3C4 ; leur réussite sur GitHub doit être observée sur le dernier commit.
- **Aucune exécution réelle** de serveur Next.js, MongoDB, Vue/Nuxt, TensorFlow, déploiement ou action composite du lot 3C4. Le code d'exemple ne vaut pas certification d'application.

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
