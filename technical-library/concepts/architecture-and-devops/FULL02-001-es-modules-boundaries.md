# FULL02-001 — ES modules pour frontières maintenables

## Identification

- **Identifiant unique :** `FULL02-001`
- **Domaine :** architecture-and-devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause (2024).
- **Chapitre :** 2, *Modern Javascript*.
- **Pages physiques PDF réellement consultées :** 45, 46, 47 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

ES modules pour frontières maintenables : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre présente les modules ES comme un moyen d'isoler le code dans des portées propres, avec `import`/`export`, exports nommés et export par défaut. Il relie cette séparation à la maintenance et à la testabilité.

## Application originale proposée par Louvre

Dans une application, séparer contrats, logique métier et accès aux données par modules nommés afin d'éviter des dépendances cachées.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Le comportement exact des extensions et de la résolution de modules dépend de Node.js, TypeScript et des paramètres de compilation. Les affirmations de l'ouvrage sont situées en 2024.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Importer un module métier depuis un test sous le mode de module réellement choisi (ESM ou CommonJS).

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.