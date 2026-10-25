# NEXT08-001 — Choisir état local, partagé ou issu du serveur

## Identification

- **Identifiant unique :** `NEXT08-001`
- **Domaine :** frontend
- **Mots-clés :** useState, useReducer, Context API, Redux Toolkit, SSR, hydratation, Pages Router
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain (2026).
- **Chapitre :** 8, *State Management in Next.js*.
- **Pages physiques PDF analysées :** 212–226 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 212, 213, 214, 215, 217, 220, 221, 224, 225, 226.
- **SHA-256 du PDF source privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Un projet Next.js mélange données serveur, état d’interface et panier global, créant duplications et comportements incohérents après actualisation.

## Ce que le livre établit sur les pages indiquées

Le chapitre compare `useState` et `useReducer`, décrit le partage d’état avec Context, examine Redux Toolkit et présente un mécanisme de préparation serveur avec `getServerSideProps` puis hydratation du client.

## Interprétation et décision d'ingénierie Louvre

Utiliser `useState` pour une interaction isolée, `useReducer` pour des transitions liées, Context pour des dépendances partagées relativement stables. Réserver un store plus structuré à des besoins concrets ; distinguer les données authentifiées du serveur de l’état temporaire côté client.

## Exemple original (pas un extrait du livre)

```ts
// Machine de filtres côté client : état local, pas vérité serveur.
type FilterState = { query: string; onlyAvailable: boolean };
type FilterAction =
  | { type: "search"; value: string }
  | { type: "availability"; enabled: boolean };
export function reduceFilters(s: FilterState, a: FilterAction): FilterState {
  return a.type === "search" ? { ...s, query: a.value }
    : { ...s, onlyAvailable: a.enabled };
}
```

## Limites et conditions d'usage

`getServerSideProps` est une API du **Pages Router**, pas un modèle général des Server Components de l’App Router. Les bibliothèques citées et leurs intégrations évoluent. Ne jamais sérialiser des secrets dans les props HTML ou l’état client.

## Vérification exigée dans un projet réel

Tester l’hydratation, l’isolation de l’état entre utilisateurs, le rendu serveur vs client et l’absence de fuite de données sensibles dans le HTML initial.

## Connexions avec les autres fiches

- Fiche antérieure : `NEXT06-001-data-fetching-tradeoffs.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.