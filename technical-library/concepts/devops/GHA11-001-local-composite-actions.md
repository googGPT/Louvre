# GHA11-001 — Factoriser un workflow en action composite locale

## Identification

- **Identifiant unique :** `GHA11-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, action.yml, composite, inputs, outputs, reusable workflow
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster.
- **Chapitre :** 11, *Creating Custom actions*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 281, 282, 283, 285, 286, 289, 310, 312, 313.
- **SHA-256 du PDF privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Plusieurs pipelines répètent les mêmes étapes de contrôle et se contredisent progressivement.

## Faits explicitement documentés par l'ouvrage

Le chapitre décrit `action.yml` et ses entrées/sorties, distingue actions composites, conteneurisées et JavaScript, et montre l’appel à une action locale via un chemin du dépôt. Il distingue également les actions locales des workflows réutilisables.

## Interprétation / adaptation Louvre

Mettre un contrôle documentaire purement local dans `.github/actions/validate-library/action.yml`, et conserver les décisions de déclenchement, branches et permissions dans le workflow appelant.

## Stratégie algorithmique ou architecturale

Le workflow vérifie le dépôt → exécute une action composite dont le `runs` décrit les étapes → récupère son état ou ses sorties. Les entrées sont considérées non fiables et passées via `env` plutôt qu’interpolées directement dans une commande shell.

## Exemple original (non recopié de l'ouvrage)

```yaml
# .github/actions/louvre-check/action.yml — exemple illustratif original
name: Louvre check
description: Validate local knowledge index
runs:
  using: composite
  steps:
    - shell: bash
      run: python3 scripts/validate_library.py
# Appel depuis un workflow qui a déjà checkout le dépôt :
# - uses: ./.github/actions/louvre-check
```


## Limites, sécurité et compatibilité

Une action locale n’est utilisable que si ses fichiers existent dans l’espace du runner, généralement après checkout. Elle hérite du contexte et des risques du workflow. Le livre date de 2023 ; vérifier les runtimes/versions modernes avant réutilisation.

## Validation / tests

Créer le fichier dans un dépôt test et vérifier un workflow de PR avec un cas valide puis un lien cassé. L’action proposée est un exemple, non ajoutée comme exécutable dans ce lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.