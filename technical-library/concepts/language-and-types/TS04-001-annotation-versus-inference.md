# TS04-001 — Choisir annotation explicite et inférence

## Identification

- **Identifiant unique :** `TS04-001`
- **Domaine :** language-and-types
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 4, *Essential Types and Annotations*.
- **Pages physiques PDF réellement consultées :** 63, 64, 65, 66 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Choisir annotation explicite et inférence : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Les premières sections du chapitre montrent les annotations de paramètres et de variables, les types primitifs et la déduction automatique du type d'une valeur initialisée. Une annotation n'est pas nécessaire à chaque déclaration.

## Application originale proposée par Louvre

Dans un service, rendre explicites les contrats publics et les frontières de dépendances tout en laissant l'inférence exprimer les variables locales évidentes.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

L'inférence dépend des valeurs et du contexte. Un type statique ne remplace pas la validation d'un JSON externe.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Comparer des exemples annotés/inférés sous `tsc --strict`, puis passer une mauvaise donnée par une frontière `unknown`.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.