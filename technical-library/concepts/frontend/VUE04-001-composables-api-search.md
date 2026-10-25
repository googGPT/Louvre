# VUE04-001 — Extraire les appels API d’un composant Vue vers des composables

## Identification

- **Identifiant unique :** `VUE04-001`
- **Domaine :** frontend
- **Mots-clés :** Vue 3, composable, ref, API, pagination, search, defineEmits
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten.
- **Chapitre :** 4, *Creating the Marvel Explorer App*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 82, 89, 92, 97, 101, 107, 108.
- **SHA-256 du PDF privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Un composant Vue de recherche mélange formulaire, calcul de pagination, appels réseau, gestion du chargement et logique métier.

## Faits explicitement documentés par l'ouvrage

Le chapitre construit un explorateur utilisant une API externe et présente des composables pour réutiliser la logique avec recherche et pagination. Il montre aussi un champ de recherche enfant qui émet un événement à son parent via `defineEmits`.

## Interprétation / adaptation Louvre

Créer `useSearch` responsable du cycle `loading/data/error`, tandis que le composant ne possède que la saisie et le rendu ; centraliser les fonctions de pagination dans un module pur séparé.

## Stratégie algorithmique ou architecturale

Événement `searchSubmit` → mise à jour de l’état → appel composable → transformation de la réponse → mise à jour du rendu. Prévoir annulation des réponses devenues obsolètes lorsqu’une nouvelle recherche est lancée.

## Exemple original (non recopié de l'ouvrage)

```ts
export function pageOffset(page: number, size: number): number {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("page invalide");
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("taille invalide");
  return (page - 1) * size;
}
// Adaptation Louvre : premier numéro de page = 1 ; ce n’est pas le calcul du livre.
```


## Limites, sécurité et compatibilité

Un composable ne gère pas automatiquement les requêtes concurrentes. Clés d’API, quotas et droits d’usage de services externes exigent une vérification, particulièrement si une clé secrète serait intégrée au client.

## Validation / tests

Test d’une pagination 1-based et gestion des valeurs hors bornes ; le comportement de `pageOffset` est exécuté dans l’exemple TypeScript du lot. Aucun navigateur Vue n’a été démarré.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.