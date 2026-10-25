# FULL12-001 — Mettre la connexion et les services MongoDB derrière une frontière

## Identification

- **Identifiant unique :** `FULL12-001`
- **Domaine :** backend-and-apis
- **Mots-clés :** Next.js, MongoDB, Mongoose, service, connexion, modèle, middleware
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause.
- **Chapitre :** 12, *Building the Middleware*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 225, 227, 228, 230, 232, 234, 235.
- **SHA-256 du PDF privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Les composants et résolveurs interrogent MongoDB directement, chacun recréant la connexion et les règles métier.

## Faits explicitement documentés par l'ouvrage

Le chapitre organise la connexion Mongoose, le schéma du modèle et les services de consultation ou de modification. La connexion est mise en cache pour éviter les reconnexions inutiles lors de certains rechargements. Les services fournissent des fonctions réutilisables pour la future API GraphQL.

## Interprétation / adaptation Louvre

Proposer une interface de dépôt ou de service devant Mongoose ; injecter cette interface dans les endpoints pour tester sans base réelle. Ne pas faire de Mongoose lui-même la validation de l’autorisation utilisateur.

## Stratégie algorithmique ou architecturale

HTTP/API → authentification et validation des entrées → service métier → modèle Mongoose → base de données. Garder la logique d’autorisation hors des filtres construits à partir d’entrées non fiables.

## Exemple original (non recopié de l'ouvrage)

```ts
interface ProjectRepo {
  findPublicById(id: string): Promise<{ id: string; title: string } | null>;
}
export async function getPublicProject(repo: ProjectRepo, id: string) {
  if (!/^[a-z0-9-]{1,50}$/.test(id)) return null;
  return repo.findPublicById(id);
}
```

Exemple original : il ne s’agit ni d’un schéma Mongoose complet ni d’une méthode du livre.

## Limites, sécurité et compatibilité

Ne jamais envoyer `MONGO_URI` au navigateur ni publier `.env.local`. L’interface ne garantit pas la robustesse de la connexion ni la sécurité du filtre SQL/NoSQL. Adapter le cache de connexion au mode serveur et à la plateforme effectivement utilisés.

## Validation / tests

Test avec dépôt simulé : ID invalide ne déclenche aucune requête, ID valide appelle le dépôt ; puis test d’intégration avec une vraie base éphémère. Aucun test MongoDB n’est exécuté dans ce lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.