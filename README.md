# Louvre — Bibliothèque technique pour Codex

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026

- **15 fiches techniques** : cinq fiches pilotes de *Total TypeScript*, plus dix fiches réparties sur les cinq livres.
- **70 chapitres cartographiés**, dont **11 ont au moins une fiche** ; il ne s'agit pas d'une analyse exhaustive de ces chapitres.
- Les cinq PDF restent **privés et absents du dépôt public** ; les références de pages sont documentées dans les fiches.
- Les résultats TypeScript et lectures de PDF des lots proviennent de l'environnement ChatGPT source, sauf mention contraire ; ne pas les présenter comme exécutés par Codex.
- Le Skill peut ne pas apparaître dans certains catalogues Codex. Le repli fonctionnel est la consultation directe de l'index et des fiches.

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
