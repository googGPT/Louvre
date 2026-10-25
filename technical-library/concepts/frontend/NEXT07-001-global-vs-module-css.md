# NEXT07-001 — Distinguer styles globaux et CSS Modules

## Identification

- **Identifiant unique :** `NEXT07-001`
- **Domaine :** frontend
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain (2026).
- **Chapitre :** 7, *Styling in Next.js*.
- **Pages physiques PDF réellement consultées :** 189, 190, 191, 192 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Distinguer styles globaux et CSS Modules : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre compare CSS global et CSS Modules scoped, puis présente d'autres approches comme SCSS, Tailwind et CSS-in-JS. Les exemples utilisant `_app.js` sont fondés sur le Pages Router.

## Application originale proposée par Louvre

Dans un projet d'interface, réserver les styles globaux aux fondations, et isoler les styles de composants pour prévenir les collisions de sélecteurs.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Les règles précises d'import CSS dépendent de l'architecture Next.js en place ; `_app.js` ne doit pas être transposé aveuglément à un projet App Router.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Créer deux composants partageant une classe CSS et vérifier l'absence de collision avec CSS Modules dans la version utilisée.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.