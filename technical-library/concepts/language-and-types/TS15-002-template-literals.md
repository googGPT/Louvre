# TS15-002 — Types de chaînes interpolées (template literal types)

> **Provenance de la validation :** les consultations du PDF et la compilation TypeScript 5.8.3 décrites dans cette fiche sont rapportées par le lot fourni depuis l'environnement source ChatGPT. Elles n'ont pas été reproduites dans cet environnement Codex : aucun accès effectif au PDF n'est établi ici et `tsc` n'est pas disponible localement. Le niveau de confiance déclaré ci-dessous est celui du livrable source, sans confirmation indépendante de l'attribution au livre. Voir le [rapport de validation](../../validation/TS15-static-typecheck.md).

## Identification

- **Identifiant unique :** `TS15-002`
- **Titre :** Types de chaînes interpolées (template literal types)
- **Domaine :** langage-et-types / contraintes statiques de chaînes
- **État :** source et exemple statique vérifiés ; **aucun essai d'intégration applicative ou runtime effectué**.

## Source et référence exacte

- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Catalogue :** `SRC-001` ; cartographie : `TS-2026` ; PDF privé SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Chapitre :** 15, *Designing Your Types*.
- **Accès :** PDF original ouvert et inspecté le 25 octobre 2026 dans la conversation ChatGPT ; **Codex ne peut pas être présumé avoir accès au PDF**.
- **Pagination :** pages physiques du PDF (base 1), distinctes de la pagination imprimée.
- **Pages physiques PDF :** 368–370 ; 382–383.
- **Sections / repères :** Template Literal Types in TypeScript ; Combining Template Literal Types with Union Types ; Exercise 15-6: Route Matching.
- **Pages imprimées :** non reportées dans cette fiche ; se référer au PDF.

## Problème technique traité

Une fonction de navigation doit distinguer, au moment de compiler, les chemins de projets des chemins d'autres rubriques.

## Explication du concept

### Faits établis par l'ouvrage

Le livre montre qu'un type de chaîne interpolée peut imposer une forme textuelle comme un suffixe de fichier ou un préfixe de route. Il montre aussi que la combinaison de plusieurs unions produit toutes les possibilités, en mettant en garde contre l'explosion combinatoire des unions (PDF p. 369).

### Interprétation et application proposée (non attribuée à l'auteur)

La notation ``type ProjectRoute = `/projects/${string}``` impose un préfixe aux littéraux statiques. Une fonction `isProjectRoute(value: string)` ajoute une vérification d'exécution pour les chaînes venues de l'extérieur.

## Principe algorithmique ou architectural et recommandations

Encoder un préfixe de route dans un type de chaîne et compléter ce contrat statique par une garde runtime. Recommandation Louvre : ne pas assimiler le préfixe typé à une validation complète des routes ou à une autorisation d’accès.

## Conditions, limites et compromis

Le type accepte aussi la chaîne `/projects/` sans identifiant, car `${string}` peut être vide : l'expression régulière d'exécution est plus stricte. N'utiliser ni ce type ni les assertions `as` pour garantir la validité d'une entrée réseau. Les unions interpolées très larges peuvent devenir coûteuses à compiler.

## Exemple original, vérification et résultats

Ouvrir `technical-library/examples/type-patterns.ts`, section `TS15-002`. Contrôler qu'un littéral `/users/abc` est refusé et qu'une garde runtime est proposée.

- **Exemple :** `technical-library/examples/type-patterns.ts` (original, conçu pour Louvre ; pas extrait du livre).
- **Commande :** `tsc --strict --noEmit --target ES2022 --module ESNext technical-library/examples/type-patterns.ts` depuis la racine du paquet pilote.
- **Environnement source ChatGPT observé :** Node.js 22.16.0 ; compilateur TypeScript 5.8.3.
- **Exécution réelle rapportée de ChatGPT :** analyse statique effectuée le 25 octobre 2026 ; statut de sortie `0` après correction d'un conflit de nom global avec `Report` via `export {}`.
- **Tests négatifs :** les erreurs attendues sont marquées `@ts-expect-error`. Le succès de `tsc` indique que les erreurs correspondantes ont été reconnues, sans prouver le comportement runtime.
- **Pas vérifié :** comportement dans une véritable application, compatibilité d'autres versions, build CI multi-environnements.

## Compatibilité technique et confiance

- **Version effectivement testée dans ChatGPT :** TypeScript 5.8.3 en mode `--strict`.
- **Compatibilité actuelle générale :** non vérifiée ; adapter à la version du futur projet.
- **Niveau de confiance :** **élevé** pour l'attribution à l'ouvrage et le contrôle statique dans l’environnement source ChatGPT ; **limité** pour l'applicabilité hors de cet environnement.
- **Dernière révision :** 2026-10-25.
## Éléments restant à vérifier dans Codex

- Confirmer les attributions, repères et pages sur le PDF original accessible de manière autorisée ; aucune page n'a été ouverte ici.
- Reproduire la commande statique documentée avec une version identifiée de TypeScript ; aucune compilation n'a été exécutée ici.
- Tester les cas limites au runtime et la compatibilité avec les versions du futur projet avant utilisation en production.
