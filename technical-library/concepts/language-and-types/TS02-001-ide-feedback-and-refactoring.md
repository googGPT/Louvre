# TS02-001 — Exploiter autocomplétion et diagnostics IDE

## Identification

- **Identifiant unique :** `TS02-001`
- **Domaine :** language-and-types
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 2, *IDE Superpowers*.
- **Pages physiques PDF réellement consultées :** 39, 40, 41, 42 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Exploiter autocomplétion et diagnostics IDE : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre traite l'autocomplétion automatique et manuelle, la lecture des messages d'erreur TypeScript, et l'exploration des types via l'IDE. L'exemple de valeur possiblement `null` montre que les diagnostics peuvent prévenir une erreur runtime.

## Application originale proposée par Louvre

Dans une base de composants, utiliser les signatures typées et les inférences affichées par l'IDE pour préparer un refactoring, puis exécuter une vérification de compilation.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Les suggestions IDE ne prouvent ni comportement métier, ni absence de défaut de sécurité. Leur présentation dépend du serveur de langage et de l'éditeur.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Essayer les suggestions sur une signature d'objet et provoquer un accès à une valeur nullable ; observer le diagnostic.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.