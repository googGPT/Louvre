# TS16-001 — Prédicats et assertions de types honnêtes

## Identification

- **Identifiant unique :** `TS16-001`
- **Domaine :** language-and-types
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*.
- **Chapitre 16 :** Building Powerful Shared Utilities.
- **Pages physiques PDF consultées :** 396–400 ; contrôle ciblé sur 396, 398, 399.
- **Empreinte SHA-256 du PDF privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Une donnée inconnue reçue d’un service est artificiellement déclarée conforme à un type sans validation.

## Éléments établis par l'ouvrage

Le chapitre distingue les prédicats de type (retour booléen), les assertions (qui lèvent une exception si le contrôle échoue) et les erreurs possibles lorsque le prédicat annonce une forme qu’il n’a pas réellement vérifiée.

## Interprétation et recommandation Louvre

Réaliser les contrôles observables sur unknown avant d’autoriser un rétrécissement de type ; conserver une validation plus riche pour les contrats complexes.

## Exemple original, non recopié du livre

Avant de traiter un identifiant issu d’une API, vérifier que la valeur est un objet non nul et que id est une chaîne.

```typescript
function hasId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string";
}
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

Le type predicate est une promesse faite au compilateur, pas une preuve automatique. Une validation partielle ou un objet mutable peut rendre cette promesse fausse.

## Méthode de validation

Tester null, chaînes, tableaux, objets sans id, id non chaîne et objet valide ; compiler la restriction des accès avant contrôle.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** type predicate, type guard, assertion, unknown, runtime validation.
- **Dernière révision :** 2026-10-25.