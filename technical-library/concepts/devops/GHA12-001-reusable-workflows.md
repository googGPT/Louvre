# GHA12-001 — Workflows réutilisables et contrats entre dépôts

## Identification

- **Identifiant unique :** `GHA12-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, workflow_call, workflow_dispatch, workflow_run, inputs, secrets, outputs
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster (2023).
- **Chapitre :** 12, *Advanced Workflows*.
- **Pages physiques PDF analysées :** 322–329 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 322, 323, 324, 325, 326, 327, 328, 329.
- **SHA-256 du PDF source privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Plusieurs dépôts doivent exécuter le même contrôle de qualité, mais copier-coller le YAML partout empêche les mises à jour cohérentes.

## Ce que le livre établit sur les pages indiquées

Le chapitre distingue `workflow_call`, `workflow_dispatch` et `workflow_run`; montre un workflow appelé depuis un autre dépôt, le contrat de paramètres, le passage des secrets et la remontée d’un résultat depuis une étape vers le job, puis le workflow appelant. Il compare les workflows réutilisables et les actions composites.

## Interprétation et décision d'ingénierie Louvre

Créer un workflow de qualité partagé, exposant des entrées explicitement typées et une permission minimale. Épingler ses références, définir les sorties utiles et traiter les secrets comme des capacités strictement nécessaires.

## Exemple original (pas un extrait du livre)

```yaml
# Exemple simplifié d'interface de workflow réutilisable.
name: Shared knowledge validation
on:
  workflow_call:
    inputs:
      strict:
        required: false
        type: boolean
        default: true
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - run: echo "validation should be implemented here"
```

## Limites et conditions d'usage

Les limites et politiques de secret décrites en 2023 ne sont pas garanties pour GitHub Actions actuel. La chaîne de commande `echo` est volontairement un emplacement, **pas une validation**. Ne pas passer `secrets: inherit` par défaut à une action tierce ou à du code non fiable.

## Vérification exigée dans un projet réel

Faire appeler le workflow depuis un petit dépôt de test et vérifier les paramètres par défaut, l’absence de secrets non prévus, le code de sortie, l’affichage des sorties et la politique des branches.

## Connexions avec les autres fiches

- Fiche antérieure : `GHA09-001-permissions-and-untrusted-input.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.