# VUE02-001 — Réactivité Vue, liste dérivée et stockage local

## Identification

- **Identifiant unique :** `VUE02-001`
- **Domaine :** frontend
- **Mots-clés :** Vue 3, ref, computed, watch, onMounted, localStorage, tri
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten (2024).
- **Chapitre :** 2, *Creating a Todo List App*.
- **Pages physiques PDF analysées :** 40–47 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 40, 41, 42, 43, 44, 45, 46, 47.
- **SHA-256 du PDF source privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Une liste de tâches doit réagir aux changements de l’utilisateur, afficher un ordre dérivé et conserver une copie locale après rechargement.

## Ce que le livre établit sur les pages indiquées

Le chapitre construit une liste Todo avec `ref`, des opérations de modification et tri, introduit `computed` pour les vues dérivées, puis conserve et recharge l’état via `localStorage` et les événements de cycle de vie du composant.

## Interprétation et décision d'ingénierie Louvre

Conserver une source de vérité locale pour la liste, calculer l’affichage via `computed`, stocker un format sérialisable et valider les données chargées. Isoler accès navigateur et logique métier pour permettre tests et rendu serveur.

## Exemple original (pas un extrait du livre)

```ts
// Projection de liste indépendante de Vue : utilisable depuis computed().
type Task = { id: string; title: string; done: boolean };
export function pendingFirst(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
}
// Dans Vue : const display = computed(() => pendingFirst(tasks.value));
```

## Limites et conditions d'usage

`localStorage` n’existe pas côté serveur ; sa capacité, la confidentialité et la synchronisation multi-onglets sont limitées. Le stockage local n’est pas une base de données sécurisée. Éviter les mutations lors d’un tri qui devrait uniquement transformer une vue.

## Vérification exigée dans un projet réel

Charger un stockage vide, invalide, ancien et valide ; basculer les statuts et vérifier que le tableau source n’est pas trié en place ; simuler actualisation de page.

## Connexions avec les autres fiches

- Fiche antérieure : `VUE05-001-pinia-state.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.