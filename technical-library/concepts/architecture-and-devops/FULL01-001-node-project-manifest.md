# FULL01-001 — Démarrer un service Node avec manifeste reproductible

## Identification

- **Identifiant unique :** `FULL01-001`
- **Domaine :** architecture-and-devops
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause (2024).
- **Chapitre :** 1, *Node.js*.
- **Pages physiques PDF réellement consultées :** 33, 34, 35, 36 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Démarrer un service Node avec manifeste reproductible : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre présente Node.js comme environnement JavaScript hors navigateur, puis le manifeste `package.json`, les scripts, dépendances d'exécution et dépendances de développement de npm.

## Application originale proposée par Louvre

Pour un service backend, déclarer clairement la commande de test et les dépendances, versionner un fichier de verrouillage et exclure `node_modules` du dépôt.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Les versions et plages npm citées dans le livre de 2024 peuvent ne plus correspondre aux dépendances recommandées ; aucun déploiement n'a été exécuté.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Effectuer une installation propre dans un dépôt pilote et lancer les scripts avec les versions réellement verrouillées.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.