# GHA08-001 — Éviter les exécutions concurrentes inutiles

## Identification

- **Identifiant unique :** `GHA08-001`
- **Domaine :** devops
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*.
- **Chapitre 8 :** Managing Workflow Execution.
- **Pages physiques PDF consultées :** 169–180 ; contrôle ciblé sur 170, 174, 178, 179.
- **Empreinte SHA-256 du PDF privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Plusieurs pushes sur la même branche lancent des builds coûteux dont certains résultats deviennent obsolètes.

## Éléments établis par l'ouvrage

Le chapitre présente les filtres de déclenchement des workflows (événements, branches, chemins), puis la clé concurrency et cancel-in-progress pour gérer plusieurs exécutions d’un workflow ou job.

## Interprétation et recommandation Louvre

Regrouper par workflow et référence Git. Annuler les contrôles de PR rendus obsolètes, mais ne pas annuler automatiquement un déploiement transactionnel.

## Exemple original, non recopié du livre

Les tests de documentation de Louvre pour une nouvelle révision peuvent remplacer ceux d’une ancienne révision de la même branche.

```yaml
concurrency:
  group: library-check-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

Ne pas partager la même clé de concurrence entre opérations sans rapport. Le modèle d’annulation doit respecter les effets secondaires ; détail à vérifier dans la documentation actuelle.

## Méthode de validation

Envoyer deux commits de test rapprochés et observer le remplacement sur une PR ; aucun workflow exécuté ici.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** GitHub Actions, concurrency, cancel-in-progress, paths, filters.
- **Dernière révision :** 2026-10-25.