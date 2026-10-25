# VUE05-002 — Composants Vuetify et dialogue de recherche découplé

## Identification

- **Identifiant unique :** `VUE05-002`
- **Domaine :** frontend
- **Mots-clés :** Vue 3, Vuetify, defineEmits, v-dialog, debounce, recherche, props
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten (2024).
- **Chapitre :** 5, *Building a Recipe App with Vuetify*.
- **Pages physiques PDF analysées :** 117–128 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128.
- **SHA-256 du PDF source privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Une interface calendrier doit ouvrir un dialogue de recherche, choisir un élément puis mettre à jour la journée sélectionnée sans rendre les composants interdépendants.

## Ce que le livre établit sur les pages indiquées

Le chapitre développe des composants de carte et tableau, déclenche un événement pour ouvrir `v-dialog`, utilise un champ de recherche observé avec délai de 500 ms, émet un événement de sélection et met à jour la liste des recettes du jour.

## Interprétation et décision d'ingénierie Louvre

Laisser le composant enfant exprimer **une intention** avec un événement typé ; laisser le parent décider de la mutation de son état. Isoler la recherche et sa temporisation. Une recherche distante doit aussi contrôler l’ordre de réponse, pas seulement réduire les appels.

## Exemple original (pas un extrait du livre)

```ts
// Contrat de données et événement Vue proposés, non exécutés ici.
type Selection = { id: number; label: string };
type PickerEvent = { kind: "select"; item: Selection };
function chooseItem(item: Selection): PickerEvent {
  return { kind: "select", item };
}
// En composant Vue : defineEmits<{ select: [item: Selection] }>();
```

## Limites et conditions d'usage

Le livre utilise des appels directs à une API externe depuis le navigateur ; les clés publiques, quotas et CORS doivent être compris selon le fournisseur. Le debounce ne neutralise ni les réponses obsolètes ni la fuite d’identifiants. Vérifier l’accessibilité clavier et les versions Vuetify.

## Vérification exigée dans un projet réel

Tests de composants : ouverture/fermeture, choix d’élément, émission d’ID, recherche rapide, réponses réseau arrivant dans un ordre inversé, et comportement en échec d’API.

## Connexions avec les autres fiches

- Fiche antérieure : `VUE05-001-pinia-state.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.