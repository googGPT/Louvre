# NEXT04-001 — Construire une route API qui valide ses entrées côté serveur

## Identification

- **Identifiant unique :** `NEXT04-001`
- **Domaine :** backend-and-apis
- **Mots-clés :** Next.js, API route, pages/api, GET, POST, JSON, validation, BFF
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain.
- **Chapitre :** 4, *API Routes in Next.js*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 100, 102, 103, 106, 108, 115, 116.
- **SHA-256 du PDF privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Une application accepte des paramètres HTTP non contrôlés et expose des clés API à son navigateur.

## Faits explicitement documentés par l'ouvrage

Le chapitre présente les routes `pages/api` qui exposent un endpoint serveur, la différenciation des méthodes HTTP, les paramètres et la validation des entrées. Il montre aussi le rôle des API routes comme interface vers des API tierces.

## Interprétation / adaptation Louvre

Faire de la route une frontière mince : contrôler méthode et schéma de données, authentifier, appeler un service, puis renvoyer une réponse JSON stable. Pour un App Router moderne, une route handler a une syntaxe différente ; vérifier la version du framework.

## Stratégie algorithmique ou architecturale

Lire et valider les entrées inconnues ; ne pas exposer les secrets ; déléguer les effets à une couche métier ; gérer statuts HTTP de façon cohérente.

## Exemple original (non recopié de l'ouvrage)

```ts
// Pseudo-contrat métier original pour un handler Next.js :
type CreatePayload = { title: string };
function parseCreate(input: unknown): CreatePayload | null {
  if (typeof input !== "object" || !input || Array.isArray(input)) return null;
  const title = (input as Record<string, unknown>).title;
  return typeof title === "string" && title.trim().length > 0 && title.length <= 120
    ? { title: title.trim() }
    : null;
}
```


## Limites, sécurité et compatibilité

Cette validation n’empêche pas les attaques d’authentification, de CSRF ou les quotas de requête. Ne pas confondre les routes `pages/api` du livre et `app/api/.../route.ts` du routage App Router ; aucun test complet Next.js effectué ici.

## Validation / tests

Tester corps absent, tableau, `title` vide, trop long, et méthode non autorisée dans un vrai projet. `parseCreate` fait partie de l’exemple TypeScript exécuté dans le lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.