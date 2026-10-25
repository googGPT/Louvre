# VUE07-001 — Partager la logique Vue entre Web et desktop

## Identification

- **Identifiant unique :** `VUE07-001`
- **Domaine :** frontend
- **Statut :** synthèse vérifiée sur PDF ; adaptation originale ; intégration logicielle non validée.

## Source et référence exacte

- **Catalogue et cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*.
- **Chapitre 7 :** Building a Multiplatform Expense Tracker Using Quasar.
- **Pages physiques PDF consultées :** 186–202 ; contrôle ciblé sur 186, 189, 195, 202.
- **Empreinte SHA-256 du PDF privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` ; vérifiée lors de la rédaction.
- **Pagination imprimée :** non utilisée ; numéros référencés à partir de 1 dans le PDF.

## Problème technique traité

Une application de suivi de dépenses doit servir plusieurs plateformes sans dupliquer toute sa logique.

## Éléments établis par l'ouvrage

Le chapitre utilise Quasar pour un projet Vue multi-plateforme, présente Electron comme cible desktop, et relie une interface à Supabase avec authentification, catégories et dépenses.

## Interprétation et recommandation Louvre

Séparer logique métier, accès aux données et composants visuels ; isoler les fonctions dépendantes de la plateforme derrière une interface.

## Exemple original, non recopié du livre

Un tableau de dépenses garde le même calcul de somme de catégorie sur Web et desktop ; le stockage ou les fichiers locaux passent par des adaptateurs distincts.

```typescript
interface PlatformStorage {
  saveExport(name: string, content: string): Promise<void>;
}
```

Ce fragment illustre un contrat ou une stratégie ; il n'est pas un service de production complet. Les exemples en pseudocode ne sont pas directement exécutables.

## Conditions, limites et sécurité

Le portage Quasar/Electron n’est pas automatiquement natif sur toutes les plateformes ; les permissions et politiques de sécurité diffèrent. Vérifier les règles d’accès par utilisateur sur le backend (par ex. RLS), proposition de sécurité extérieure au passage cité.

## Méthode de validation

Tester synchronisation multi-compte, isolation des données, packaging de la cible et stockage des identifiants ; aucune distribution Electron exécutée.

- **Vérifications réalisées dans l'environnement source :** PDF ouvert aux pages indiquées ; SHA-256 concordant ; formulation originale contrôlée.
- **Vérifications non réalisées :** tests applicatifs, intégration du framework et compatibilité exhaustive aux dernières versions, sauf mention expresse dans un rapport externe.
- **Confiance :** élevée pour l'attribution de principe aux pages consultées ; moyenne pour toute généralisation à une application concrète.
- **Mots-clés :** Vue, Quasar, Electron, Supabase, multiplatform, expense.
- **Dernière révision :** 2026-10-25.