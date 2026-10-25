# GHA13-001 — Matrices de jobs, exclusions et pression sur les runners

## Identification

- **Identifiant unique :** `GHA13-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, strategy matrix, include, exclude, fail-fast, max-parallel
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 13, *Advanced Workflow Techniques*.
- **Pages physiques PDF analysées :** 344–352 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 344, 345, 346, 347, 348, 349, 350, 351, 352.
- **SHA-256 du PDF source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Tester plusieurs versions d’un runtime et plusieurs systèmes d’exploitation sans dupliquer chaque job ni saturer la capacité des runners.

## Ce que le livre établit sur les pages indiquées

Le chapitre montre la création automatique de jobs avec une matrice à une ou plusieurs dimensions, l’ajout et la suppression de combinaisons par `include`/`exclude`, ainsi que `fail-fast` et `max-parallel` pour le traitement des échecs et la pression d’exécution.

## Interprétation et décision d'ingénierie Louvre

Modéliser les dimensions dont les résultats comptent réellement, limiter la combinatoire, puis fixer explicitement la politique d’échec anticipé et le parallélisme. Ne pas utiliser une matrice géante uniquement pour multiplier les badges verts.

## Exemple original (pas un extrait du livre)

```yaml
# Proposition Louvre : à lancer dans un dépôt de test.
name: Test matrix
on: [pull_request]
permissions:
  contents: read
jobs:
  smoke:
    strategy:
      fail-fast: false
      max-parallel: 2
      matrix:
        node: ['20', '22']
        os: [ubuntu-latest, windows-latest]
        exclude:
          - node: '20'
            os: windows-latest
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: node --version
```

## Limites et conditions d'usage

Les versions et conditions d’exécution sont illustratives ; actions, images et runners doivent être vérifiés selon le contexte et les politiques du dépôt. Une matrice multiplie la consommation et peut masquer les erreurs si la tolérance à l’échec est abusive.

## Vérification exigée dans un projet réel

Déclencher une PR de test, contrôler le nombre attendu de 3 jobs, la variété des runners, le plafonnement du parallélisme et un échec volontaire avec `fail-fast: false`.

## Connexions avec les autres fiches

- Fiche antérieure : `GHA08-001-concurrency-groups.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.