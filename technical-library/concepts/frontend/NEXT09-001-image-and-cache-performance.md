# NEXT09-001 — Optimiser images, cache et métriques

## Identification

- **Identifiant unique :** `NEXT09-001`
- **Domaine :** frontend
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*.
- **Chapitre 9 :** Performance Optimization in Next.js.
- **Pages physiques PDF consultées :** 230–242 ; contrôle ciblé sur 230, 232, 238, 240.
- **Empreinte SHA-256 du PDF privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Une interface Next.js devient lente malgré des composants corrects.

## Éléments établis par l'ouvrage

Le chapitre traite des images optimisées, du lazy loading, des mécanismes de cache et de régénération ainsi que de l’audit Lighthouse. Il comporte des exemples utilisant les API historiques du Pages Router et des éléments de Next.js 15.

## Interprétation et recommandation Louvre

Mesurer les métriques de départ, cibler les ressources lourdes, mettre en cache uniquement ce qui peut l’être, puis remesurer.

## Exemple original, non recopié du livre

Pour un catalogue public, réduire le poids des images de couverture et tester les temps de chargement avant d’ajouter de la régénération côté serveur.

```text
Mesurer → identifier image/JS/réseau → modifier un facteur →
remesurer Lighthouse et vérifier la fraîcheur des données
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

Les APIs Pages Router (getStaticProps, revalidate) ne sont pas interchangeables telles quelles avec l’App Router. Éviter le cache commun pour des informations personnalisées.

## Méthode de validation

Comparer audit avant/après, régression SEO et accessibilité, cache privé et comportement d’invalidation ; aucun Lighthouse exécuté.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** Next.js, Lighthouse, image optimization, lazy loading, ISR, cache.
- **Dernière révision :** 2026-10-25.