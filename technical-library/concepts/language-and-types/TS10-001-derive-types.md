# TS10-001 — Dériver les types des valeurs et contrats existants

## Identification

- **Identifiant unique :** `TS10-001`
- **Domaine :** language and types
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Chapitre :** 10, *Deriving Types*.
- **Pages physiques PDF vérifiées :** 228–233 ; 242–244 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Maintenir manuellement la même liste de valeurs métier et un type équivalent peut provoquer des divergences.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre montre comment dériver des types à partir d’autres types ou de valeurs JavaScript avec `typeof` et `keyof`, extraire des propriétés via les types indexés, et obtenir des types de retour avec `ReturnType`. Il souligne que les types dérivés introduisent également un couplage, puisque modifier la source fait évoluer les dépendances.

### Interprétation et application Louvre

Pour des codes d’état centralisés, conserver un objet constant comme source de vérité et dériver son union des valeurs ; documenter l’impact des changements sur les consommateurs.

## Principe algorithmique ou architectural

`typeof` relève la forme du constant, `keyof` ses clés et `[keyof typeof ...]` l’union des valeurs. Les opérations sont purement statiques.

## Conditions, limites et compromis

Aucun contrôle de valeurs JSON externes ; un type n’existe pas au runtime ; la dérivation est déconseillée si les contrats doivent évoluer indépendamment.

## Exemple original d’application

Voir `technical-library/examples/cross-book-type-patterns.ts` (`TS10-001`) : `taskCodes as const`, union des codes et rejet statique d’une valeur étrangère.

## Méthode de test et validation

Compiler en mode strict ; vérifier que le retrait d’un code du constant invalide les usages dépendants. Ne pas présenter le succès statique comme test runtime.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** contrôle statique TypeScript local décrit dans le rapport du lot.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

TypeScript 5.8.3 testé ici ; compatibilité d’autres compilateurs non évaluée.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.