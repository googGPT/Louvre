# VUE01-001 — Structure d’une application Vue et outillage de développement

## Identification

- **Identifiant unique :** `VUE01-001`
- **Domaine :** frontend
- **Mots-clés :** Vue 3, Vite, TypeScript, IDE, DevTools, SFC, main.ts, App.vue
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten (2024).
- **Chapitre :** 1, *Introduction to Vue.js*.
- **Pages physiques PDF analysées :** 26–33 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 26, 27, 28, 29, 30, 31, 32, 33.
- **SHA-256 du PDF source privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Une équipe débute une application Vue et confond point de montage, composants SFC, dossiers sources et ressources publiques.

## Ce que le livre établit sur les pages indiquées

Le chapitre distingue Vue sans outillage de sa version avec compilation et composants Single File Component, présente le terminal, VSCode, DevTools, TypeScript, ESLint et Prettier, puis commente le rôle des fichiers `index.html`, `package.json`, `main.ts`, `App.vue` et des dossiers `src` et `public`.

## Interprétation et décision d'ingénierie Louvre

Conserver un point de montage explicite, un composant racine simple et une arborescence métier lisible. Garder les fichiers statiques de `public` séparés des modules importés dans `src`. Vérifier la compatibilité de la commande de scaffolding avec la version actuelle de Vue et de son outil de build.

## Exemple original (pas un extrait du livre)

```text
# Arborescence proposée (illustration, pas un projet exécutable)
index.html            # Contient le conteneur d’accueil de Vue.
src/main.ts           # Initialise et monte l’application.
src/App.vue           # Racine de l’interface.
src/components/       # Vue et composants réutilisables.
src/features/         # Fonctionnalités de domaine.
public/               # Fichiers statiques servis tels quels.
```
# En démarrage réel, vérifier build, lint et navigateur plutôt que seulement HMR.

## Limites et conditions d'usage

Les recommandations CLI et l’exemple Node.js datent de l’édition 2024. `scoped` limite la portée des styles d’un composant mais n’est pas un isolement de sécurité. Une modification visible dans DevTools ou hot-reload ne signifie pas que le code passe les tests ou le build.

## Vérification exigée dans un projet réel

Scaffolder dans une branche de test avec les versions officielles actuelles, vérifier `npm run build`, le lint, le premier composant et l’inspection DevTools sans supposer que le CLI de 2024 est toujours recommandé.

## Connexions avec les autres fiches

- Fiche antérieure : `VUE02-001-vue-reactivity-localstorage.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.