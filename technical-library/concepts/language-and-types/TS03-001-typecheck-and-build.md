# TS03-001 — Séparer vérification des types, compilation et exécution

## Identification

- **Identifiant unique :** `TS03-001`
- **Domaine :** language-and-types
- **Mots-clés :** TypeScript, tsc, transpilation, noEmit, build, bundler, CI
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell.
- **Chapitre :** 3, *TypeScript in the Development Pipeline*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 54, 55, 56, 58, 59.
- **SHA-256 du PDF privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Un développeur croit que le navigateur exécute directement des fichiers TypeScript, ou confond compilation, assemblage et tests.

## Faits explicitement documentés par l'ouvrage

Le chapitre montre qu’un navigateur ne comprend pas directement les annotations de types, puis utilise `tsc` pour produire du JavaScript et `tsc --watch` pour contrôler les changements. La section sur les frameworks explique que compilation TypeScript, CSS et bundling sont des responsabilités distinctes.

## Interprétation / adaptation Louvre

Séparer trois étapes : (1) typecheck avec `tsc --noEmit`, (2) build avec le bundler du projet, (3) tests et démarrage dans un environnement de déploiement. Ne jamais considérer un typecheck comme un test des requêtes réelles.

## Stratégie algorithmique ou architecturale

Une erreur de type stoppe le pipeline ; un JavaScript valide produit par le bundler passe ensuite aux tests et au contrôle de sécurité. Consigner les versions des outils.

## Exemple original (non recopié de l'ouvrage)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "next build",
    "check": "npm run typecheck && npm run build"
  }
}
```

`next build` est une **adaptation Louvre à un projet Next.js** ; le chapitre utilise aussi un exemple HTML simple et des outils de frontend.

## Limites, sécurité et compatibilité

Le succès de `tsc --noEmit` ne valide ni les entrées HTTP ni les tests runtime. L’option de sortie JavaScript `tsc` dépend de `tsconfig.json` ; ne jamais ignorer une sortie avec erreurs. Les commandes npm supposent le package.json du projet.

## Validation / tests

Exécuter les deux scripts dans la version exacte du dépôt ; vérifier les codes retour et les artefacts attendus. La compilation du seul exemple TypeScript du lot ne valide pas ce pipeline Next.js.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.