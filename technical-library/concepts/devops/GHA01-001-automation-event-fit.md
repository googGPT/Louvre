# GHA01-001 — Choisir quand automatiser avec GitHub Actions

## Identification

- **Identifiant unique :** `GHA01-001`
- **Domaine :** devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 1, *The Basics*.
- **Pages physiques PDF réellement consultées :** 25, 26, 27, 28 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Choisir quand automatiser avec GitHub Actions : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre introduit les usages, coûts et cas d'emploi de GitHub Actions : réagir à des pushes ou Pull Requests, lancer une construction et des tests, et réutiliser des actions existantes.

## Application originale proposée par Louvre

Pour Louvre, réserver les workflows aux contrôles reproductibles après modification de documents ou de code ; ne pas déclencher d'étapes coûteuses sans bénéfice.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Le coût, les quotas et la politique d'utilisation changent ; les explications du livre datent de 2023 et ne sont pas une grille tarifaire actuelle.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Vérifier le déclenchement sur une PR de test et le temps réel des jobs avant de généraliser le pipeline.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.