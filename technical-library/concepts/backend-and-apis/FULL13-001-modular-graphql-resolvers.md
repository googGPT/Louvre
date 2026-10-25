# FULL13-001 — Assembler schémas GraphQL et résolveurs sans contourner les autorisations

## Identification

- **Identifiant unique :** `FULL13-001`
- **Domaine :** backend-and-apis
- **Mots-clés :** GraphQL, schema, query, mutation, resolver, OAuth, service
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause.
- **Chapitre :** 13, *Building the GraphQL API*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 237, 238, 239, 240, 241, 242, 243.
- **SHA-256 du PDF privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Une API GraphQL regroupe tous les types et résolveurs dans un fichier géant, ou autorise une mutation simplement parce que le client fournit un identifiant.

## Faits explicitement documentés par l'ouvrage

Le chapitre sépare schémas de query, mutation et types, compose leurs définitions, puis combine les résolveurs. Il annonce que les queries sont publiques et que les mutations doivent être protégées par OAuth, avec informations de session accessibles lors du traitement.

## Interprétation / adaptation Louvre

Créer une frontière d’autorisation dans chaque mutation sensible et, au niveau du service, vérifier que l’utilisateur authentifié peut modifier la ressource. Segmenter par domaine pour permettre des tests indépendants.

## Stratégie algorithmique ou architecturale

Mutation → contexte authentifié → vérification du propriétaire et du rôle → service métier → réponse typée. Ne jamais utiliser `userId` provenant des arguments de la mutation comme identité vérifiée.

## Exemple original (non recopié de l'ouvrage)

```ts
type Viewer = { id: string } | null;
export function authorizeProjectEdit(viewer: Viewer, ownerId: string): boolean {
  return viewer !== null && viewer.id === ownerId;
}
// Le resolver résout l’identité depuis le contexte serveur, pas les variables GraphQL.
```


## Limites, sécurité et compatibilité

Un schéma GraphQL décrit des types, mais n’authentifie personne. La validation des entrées, la limitation de profondeur ou de coût des requêtes et la protection des informations privées restent nécessaires. Ne pas supposer la compatibilité des paquets Apollo montrés avec toute version moderne.

## Validation / tests

Tests négatifs : utilisateur anonyme, utilisateur différent du propriétaire, mutation mal formée ; test d’intégration GraphQL avec contexte serveur. Aucun serveur Apollo démarré dans ce lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.