# NEXT05-001 — Séparer connexion et contrôle d’accès Next.js

## Identification

- **Identifiant unique :** `NEXT05-001`
- **Domaine :** security
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*.
- **Chapitre 5 :** Authentication and Authorization.
- **Pages physiques PDF consultées :** 127–141 ; contrôle ciblé sur 127, 132, 134, 140.
- **Empreinte SHA-256 du PDF privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Un utilisateur authentifié tente d’accéder aux documents d’un autre compte via une route serveur.

## Éléments établis par l'ouvrage

Le chapitre distingue authentification (identité) et autorisation (permissions), présente plusieurs approches de connexion et aborde les stratégies de session, de rôles et de jetons.

## Interprétation et recommandation Louvre

Appliquer l’autorisation dans la fonction serveur qui lit ou écrit la ressource, pas uniquement dans un composant ou un menu. Utiliser des règles fondées sur l’objet demandé.

## Exemple original, non recopié du livre

La route de téléchargement d’une facture contrôle que l’utilisateur de la session possède effectivement cette facture avant d’envoyer son contenu.

```text
session = requireSession(request)
invoice = loadInvoice(invoiceId)
if (!canReadInvoice(session.userId, invoice)) deny()
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

Masquer un bouton n’est pas une autorisation ; les mécanismes et API d’authentification Next.js peuvent évoluer et doivent être vérifiés selon la version. Exemple intentionnellement pseudocode.

## Méthode de validation

Tester session absente, propriétaire, autre utilisateur, compte suspendu et tentative IDOR. Aucune application Next.js exécutée.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** Next.js, authentication, authorization, RBAC, session, IDOR.
- **Dernière révision :** 2026-10-25.