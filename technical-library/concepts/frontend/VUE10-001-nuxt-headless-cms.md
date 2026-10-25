# VUE10-001 — Séparer le contenu éditorial du rendu Nuxt

## Identification

- **Identifiant unique :** `VUE10-001`
- **Domaine :** frontend
- **Mots-clés :** Nuxt, Storyblok, headless CMS, contenu typé, SEO, SSG, déploiement
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Livre :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten.
- **Chapitre :** 10, *Creating a Portfolio with Nuxt.js and Storyblok*.
- **Pages physiques PDF retenues :** 272–296 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 272, 279, 280, 281, 283, 284, 290, 295, 296.
- **Empreinte SHA-256 du PDF source :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Permettre à un éditeur de modifier les contenus sans redéployer le code à chaque phrase.

## Ce qui vient du livre

Le chapitre construit un portfolio Nuxt alimenté par Storyblok, associe les blocs du CMS à des composants Vue, définit des types de contenus réutilisables et décrit le passage vers un site autonome statique. Il montre aussi la configuration de métadonnées et le déploiement.

## Interprétation et application Louvre (originale)

Pour un hub de projets étudiants, modéliser dans le CMS un type Projet comportant titre, résumé, publication et illustration. Charger et valider les données sur le serveur avant le rendu.

## Principe d'architecture et de raisonnement

Le CMS possède les données éditoriales ; Nuxt se charge des routes et des composants ; les métadonnées SEO proviennent de champs explicitement contrôlés. Les prévisualisations brouillon doivent être séparées de la publication.

## Exemple original, non copié du livre

```ts
type ProjectEntry = {
  slug: string;
  title: string;
  summary: string;
  published: boolean;
};

function publicProjects(items: ProjectEntry[]): ProjectEntry[] {
  return items.filter(x => x.published && x.slug.length > 0);
}
```

## Limites et compatibilité

Le livre décrit un processus de développement de 2024, incluant des réglages locaux TLS permissifs ; **ne jamais désactiver la vérification des certificats pour contourner une erreur HTTPS**, notamment pas en production. Le rendu HTML riche provenant du CMS exige une politique de sanitisation adaptée.

## Validation à réaliser dans un projet réel

Vérifier les droits et tokens CMS, contrôler les brouillons, le HTML riche, les métadonnées SEO, le rendu statique et les secrets au déploiement.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.