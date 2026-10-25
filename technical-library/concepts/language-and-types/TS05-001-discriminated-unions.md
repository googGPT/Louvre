# TS05-001 — Unions discriminées et états impossibles

## Identification

- **Identifiant unique :** `TS05-001`
- **Domaine :** language and types
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Chapitre :** 5, *Unions, Literals, and Narrowing*.
- **Pages physiques PDF vérifiées :** 127–133 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Un état de chargement possédant des propriétés facultatives indépendantes peut exprimer des combinaisons incohérentes (données et erreur simultanées).

## Explication détaillée du concept

### Faits issus de l’ouvrage

La section « Discriminated Unions » présente le problème d’un objet contenant de nombreuses propriétés optionnelles, puis sépare les cas de chargement, succès et erreur par une propriété discriminante. Le chapitre explique que les conditions et les branches de switch affinent le type, et qu’une déstructuration prématurée du reste de l’objet peut rompre le lien avec le discriminant.

### Interprétation et application Louvre

Pour une interface de suivi de dossiers, représenter chaque étape par une branche distincte ; traiter le discriminant avant d’accéder au payload et utiliser un contrôle d’exhaustivité lors de l’ajout de nouveaux statuts.

## Principe algorithmique ou architectural

Un champ littéral commun (« phase » dans notre adaptation) détermine la variante ; les champs propres à une variante ne sont accessibles qu’après son identification.

## Conditions, limites et compromis

Le type ne protège pas contre des données JSON non validées ; les états sont vérifiés au compilateur seulement. Ne pas séparer le discriminant des autres propriétés avant de réduire le type.

## Exemple original d’application

Voir `technical-library/examples/cross-book-type-patterns.ts` (`TS05-001`) : états `queued`, `done`, `failed`, fonction `messageFor` et cas invalide attendu.

## Méthode de test et validation

Compilation statique en mode strict de l’exemple original ; tester les trois branches et ajouter temporairement un quatrième état pour vérifier le contrôle d’exhaustivité.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** contrôle statique TypeScript local décrit dans le rapport du lot.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

TypeScript 5.8.3 pour le test de cette adaptation ; pas de test d’application ni de validation runtime.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.