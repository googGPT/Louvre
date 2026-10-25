# FULL15-001 — Session OAuth et autorisation effective des mutations GraphQL

## Identification

- **Identifiant unique :** `FULL15-001`
- **Domaine :** security
- **Mots-clés :** OAuth, Auth.js, session, GraphQL, resolver, authGuard, autorisation, wishlist
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause (2024).
- **Chapitre :** 15, *Adding OAuth*.
- **Pages physiques PDF analysées :** 262–265, 277–281 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 262, 263, 264, 265, 277, 278, 279, 280, 281.
- **SHA-256 du PDF source privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Un utilisateur est connecté à l’interface, mais une mutation GraphQL reste accessible si elle n’effectue pas son contrôle d’autorisation côté serveur.

## Ce que le livre établit sur les pages indiquées

Le chapitre relie une application OAuth GitHub à une session Auth.js puis montre, via un appel direct à l’API, que les mutations wishlist restent publiques avant d’ajouter un garde. Il vérifie la présence du jeton et l’identité privée associée avant de laisser modifier une liste utilisateur.

## Interprétation et décision d'ingénierie Louvre

Séparer trois étapes : identité confirmée par la session, autorisation serveur sur la ressource cible, mutation. Recalculer le propriétaire depuis une identité côté serveur plutôt que faire confiance à un `user_id` fourni par le navigateur. Tester l’API sans passer par l’interface.

## Exemple original (pas un extrait du livre)

```ts
// Adaptation originale : autorisation au niveau du domaine.
type Actor = { userId: string } | null;
type WishItem = { ownerId: string; itemId: string };
export function canRemove(actor: Actor, item: WishItem): boolean {
  return actor !== null && actor.userId === item.ownerId;
}
// Le resolver doit obtenir actor d'une session vérifiée, non du payload.
```

## Limites et conditions d'usage

Le projet du livre correspond à une version historique de `next-auth` / Auth.js et de Next.js : les chemins et signatures doivent être revérifiés avant implémentation. Comparer l’identité demandée en argument ne suffit pas si elle provient de données falsifiables. Faire une réponse d’erreur API adaptée, sans exposer les détails de session.

## Vérification exigée dans un projet réel

Tester les mutations avec : aucun token ; token expiré ; utilisateur A agissant sur l’objet de B ; propriétaire légitime ; rejet direct via curl et non seulement bouton masqué.

## Connexions avec les autres fiches

- Fiche antérieure : `FULL09-001-oauth-delegation-flow.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.