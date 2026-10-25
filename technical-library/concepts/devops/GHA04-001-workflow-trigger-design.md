# GHA04-001 — Définir des workflows CI déclenchés au bon événement

## Identification

- **Identifiant unique :** `GHA04-001`
- **Domaine :** devops
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*.
- **Chapitre 4 :** Working with Workflows.
- **Pages physiques PDF consultées :** 59–75 ; contrôle ciblé sur 60, 62, 67, 74.
- **Empreinte SHA-256 du PDF privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Une vérification automatique ne s’exécute pas au bon moment, ou ne s’exécute qu’à la demande.

## Éléments établis par l'ouvrage

Le chapitre décrit le fichier YAML dans .github/workflows, les déclencheurs comme workflow_dispatch et les jobs associés à une Pull Request. Il présente le suivi des checks après création d’une PR.

## Interprétation et recommandation Louvre

Définir explicitement les événements utiles (PR, push, lancement manuel), exécuter un contrôle déterministe et garder les permissions minimales.

## Exemple original, non recopié du livre

À chaque Pull Request Louvre, vérifier les identifiants de fiches et les liens locaux sans accéder aux secrets.

```yaml
on:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

La sélection des événements et l’interprétation des checks dépendent de la configuration du dépôt. Le YAML exemple ne suffit pas à lui seul : il faut jobs, checkout et script de contrôle.

## Méthode de validation

Déclencher une PR sur branche de test et examiner le job GitHub ; non exécuté à la préparation du lot.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** GitHub Actions, workflows, triggers, pull_request, workflow_dispatch, CI.
- **Dernière révision :** 2026-10-25.