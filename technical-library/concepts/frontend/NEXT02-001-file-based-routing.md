# NEXT02-001 — Organiser les routes statiques, dynamiques et catch-all

## Identification

- **Identifiant unique :** `NEXT02-001`
- **Domaine :** frontend
- **Mots-clés :** Next.js, App Router, Pages Router, slug, catch-all, routing
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Livre :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain.
- **Chapitre :** 2, *Next.js File-Based Routing*.
- **Pages physiques PDF retenues :** 43–67 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 43, 45, 48, 60, 62, 64, 66.
- **Empreinte SHA-256 du PDF source :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Créer des URL lisibles et prévoir les segments dynamiques sans maintenir un routeur manuel.

## Ce qui vient du livre

Le chapitre explique le routage par fichiers, les segments dynamiques entre crochets et les routes catch-all, avec des exemples Pages Router et App Router. Il décrit aussi la navigation et l’organisation des layouts.

## Interprétation et application Louvre (originale)

Pour un catalogue de projets, utiliser une route de liste /projets et une route dynamique /projets/[slug]. Choisir un seul mode de routage principal et traiter le paramètre slug comme entrée non fiable.

## Principe d'architecture et de raisonnement

Chaque route définit sa stratégie de chargement et de contrôle d’accès ; une route dynamique ne garantit pas qu’une ressource existe ni que le visiteur peut la consulter.

## Exemple original, non copié du livre

```ts
// Schéma de fichiers App Router, exemple original
// app/projets/page.tsx            -> /projets
// app/projets/[slug]/page.tsx     -> /projets/mon-projet
// app/projets/layout.tsx          -> mise en page partagée

function isProjectSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}
```

## Limites et compatibilité

Le livre présente des syntaxes issues de modes de routage distincts et potentiellement de versions différentes de Next.js ; ne pas copier un composant Pages Router dans l’App Router sans adaptation. La validation de slug ne remplace pas l’autorisation ni la réponse 404.

## Validation à réaliser dans un projet réel

Vérifier les chemins statiques, les slugs inconnus, les URL malformées, les droits et le rendu des layouts avec la version de Next.js réellement installée.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.