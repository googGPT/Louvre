# GHA14-001 — Migrer progressivement une CI existante vers GitHub Actions

## Identification

- **Identifiant unique :** `GHA14-001`
- **Domaine :** devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 14, *Migrating to GitHub Actions*.
- **Pages physiques PDF réellement consultées :** 359, 360, 361, 362 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Migrer progressivement une CI existante vers GitHub Actions : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre décrit une démarche de migration depuis d'autres plateformes CI/CD et évoque GitHub Actions Importer. Il insiste sur l'inventaire préalable du code, des branches, scripts personnalisés et automatisations réellement utilisées.

## Application originale proposée par Louvre

Pour migrer une application vers GitHub, dresser la liste des jobs et secrets existants, traduire un pipeline simple, exécuter les deux en parallèle, comparer leurs résultats puis retirer l'ancien.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

La prise en charge exacte des plateformes et les fonctions de l'Importer sont datées de 2023 et doivent être vérifiées avant toute migration actuelle.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Construire un tableau avant/après des événements, jobs, secrets et artefacts ; comparer deux exécutions réelles avant bascule.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.