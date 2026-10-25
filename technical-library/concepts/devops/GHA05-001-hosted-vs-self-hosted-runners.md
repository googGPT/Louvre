# GHA05-001 — Choisir un runner GitHub hébergé ou autogéré selon le risque

## Identification

- **Identifiant unique :** `GHA05-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, runners, labels, self-hosted, isolation, public PR
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Livre :** *Learning GitHub Actions*, Brent Laster.
- **Chapitre :** 5, *Runners*.
- **Pages physiques PDF retenues :** 89–109 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 89, 90, 91, 94, 95, 96, 100, 103, 108.
- **Empreinte SHA-256 du PDF source :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Décider où exécuter les workflows sans exposer les machines ou les identifiants.

## Ce qui vient du livre

Le chapitre décrit les runners GitHub-hosted et self-hosted, la sélection via `runs-on`, les labels et groupes, les diagnostics, les limites documentées à l’époque et l’autoscaling avec Actions Runner Controller. Il avertit des risques des runners autogérés sur les dépôts publics.

## Interprétation et application Louvre (originale)

Pour Louvre, utiliser un runner temporaire GitHub-hosted pour la validation documentaire des Pull Requests, sans secret ni permission écriture. Réserver l’autohébergement à un contexte isolé et gouverné.

## Principe d'architecture et de raisonnement

Environnement éphémère pour les contributions non fiables, permissions minimales, actions versionnées et absence d’accès aux ressources internes sensibles. Évaluer les coûts et quotas selon l’offre actuelle.

## Exemple original, non copié du livre

```yaml
name: Example validation
on: [pull_request]
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: python scripts/validate_library.py
```

## Limites et compatibilité

Le YAML est illustratif, non testé dans ce lot. Les images, étiquettes, quotas et versions d’actions ont évolué depuis 2023 : vérifier la documentation GitHub actuelle avant toute adoption. Éviter les runners self-hosted permanents pour PR non fiables.

## Validation à réaliser dans un projet réel

Sur une PR non privilégiée, vérifier la lecture seule, l’absence de secrets et le bon passage en échec lors d’un lien cassé.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.