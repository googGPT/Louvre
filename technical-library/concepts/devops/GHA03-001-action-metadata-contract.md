# GHA03-001 — Lire les contrats action.yml avant de réutiliser une action

## Identification

- **Identifiant unique :** `GHA03-001`
- **Domaine :** devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 3, *What’s in an action?*.
- **Pages physiques PDF réellement consultées :** 47, 48, 49, 50, 53 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Lire les contrats action.yml avant de réutiliser une action : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre distingue les workflows qui orchestrent les jobs et les actions réutilisables appelées par les steps. Il présente le fichier `action.yml` comme contrat d'interface décrivant les entrées et sorties d'une action.

## Application originale proposée par Louvre

Avant d'ajouter une action tierce à GitHub, vérifier ses paramètres, sa provenance, la version fixée et les permissions minimales requises.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

L'inspection d'un `action.yml` ne suffit pas pour auditer le code exécuté, la chaîne de dépendances ou la sécurité d'une action externe.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Lire les métadonnées d'une action choisie et valider ses entrées en CI sur un dépôt isolé.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.