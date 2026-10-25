# TS07-001 — Distinguer readonly au compilateur et immutabilité réelle

## Identification

- **Identifiant unique :** `TS07-001`
- **Domaine :** language-and-types
- **Mots-clés :** readonly, as const, Object.freeze, mutabilité, API, types littéraux
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell.
- **Chapitre :** 7, *Mutability*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 169, 170, 174, 175, 180, 181, 185, 187.
- **SHA-256 du PDF privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Une fonction modifie involontairement un tableau fourni par son appelant ; une configuration annotée `readonly` est supposée figée à l’exécution.

## Faits explicitement documentés par l'ouvrage

Le chapitre montre l’effet de `const` sur l’inférence, la compatibilité de paramètres `readonly T[]`, l’usage de `as const` pour inférer les littéraux et l’écart entre restrictions TypeScript et immobilisation à l’exécution. `Object.freeze` ne gèle que superficiellement.

## Interprétation / adaptation Louvre

Pour les paramètres des fonctions de sélection, utiliser `readonly` afin de signaler la non-mutation. Pour la configuration, combiner `as const` et validation runtime quand les données proviennent d’une source externe ; ne pas promettre une immutabilité profonde avec le seul typage.

## Stratégie algorithmique ou architecturale

Accepter un tableau en lecture seule, construire de nouveaux objets avec `map` ou décomposition, puis retourner de nouvelles valeurs. Ne pas utiliser de `push`, `sort` in-place ou affectation directe à un champ reçu.

## Exemple original (non recopié de l'ouvrage)

```ts
export const sortScores = (scores: readonly number[]): number[] =>
  [...scores].sort((a, b) => b - a);

const POLICY = { mode: "review", maxUsers: 25 } as const;
// POLICY.maxUsers = 30; // erreur de type, pas une protection runtime
```


## Limites, sécurité et compatibilité

Le typage n’arrête pas une mutation causée par du JavaScript non typé ou par une assertion. `Object.freeze` est superficiel. Faire attention à `sort()` sur l’entrée sans copie et aux copies superficielles d’objets imbriqués.

## Validation / tests

Vérifier que `sortScores` ne modifie pas l’entrée et que l’exemple compile en mode strict ; ces vérifications sont réalisées dans l’exemple source TS du lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.