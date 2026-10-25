# GHA02-001 — Comprendre événement, workflow, job et step

## Identification

- **Identifiant unique :** `GHA02-001`
- **Domaine :** devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 2, *How Does Actions Work?*.
- **Pages physiques PDF réellement consultées :** 37, 38, 39, 40 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Comprendre événement, workflow, job et step : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre décrit comment un événement GitHub conduit à la recherche d'un fichier `.github/workflows`, au lancement du workflow correspondant, puis à l'exécution de jobs et de steps.

## Application originale proposée par Louvre

Pour un dépôt documentaire, isoler un job de contrôle des liens d'un job de compilation et conditionner leur exécution aux changements pertinents.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Un événement déclenché ne signifie pas que le job a réussi ; les filtres de branches et de chemins doivent être confrontés au contexte réel d'une PR.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Introduire volontairement une erreur de lien et constater quel step échoue, puis corriger et confirmer le retour au vert.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.