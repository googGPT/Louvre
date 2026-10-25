# TS15-003 — Types conditionnels pour transformations sélectives

> **Provenance de la validation :** les consultations du PDF et la compilation TypeScript 5.8.3 décrites dans cette fiche sont rapportées par le lot fourni depuis l'environnement source ChatGPT. Elles n'ont pas été reproduites dans cet environnement Codex : aucun accès effectif au PDF n'est établi ici et `tsc` n'est pas disponible localement. Le niveau de confiance déclaré ci-dessous est celui du livrable source, sans confirmation indépendante de l'attribution au livre. Voir le [rapport de validation](../../validation/TS15-static-typecheck.md).

## Identification

- **Identifiant unique :** `TS15-003`
- **Titre :** Types conditionnels pour transformations sélectives
- **Domaine :** langage-et-types / composition de types
- **État :** source et exemple statique vérifiés ; **aucun essai d'intégration applicative ou runtime effectué**.

## Source et référence exacte

- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Catalogue :** `SRC-001` ; cartographie : `TS-2026` ; PDF privé SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Chapitre :** 15, *Designing Your Types*.
- **Accès :** PDF original ouvert et inspecté le 25 octobre 2026 dans la conversation ChatGPT ; **Codex ne peut pas être présumé avoir accès au PDF**.
- **Pagination :** pages physiques du PDF (base 1), distinctes de la pagination imprimée.
- **Pages physiques PDF :** 370–371.
- **Sections / repères :** Conditional Types.
- **Pages imprimées :** non reportées dans cette fiche ; se référer au PDF.

## Problème technique traité

Un helper de bibliothèque doit accepter un type scalaire ou déjà de type tableau sans introduire automatiquement un niveau supplémentaire d'imbrication.

## Explication du concept

### Faits établis par l'ouvrage

Le chapitre décrit les types conditionnels sous la forme `T extends X ? Y : Z` et les utilise pour éviter de transformer un tableau en tableau de tableaux. Il note que cette abstraction est surtout utile dans les bibliothèques complexes et peut être disproportionnée pour du code applicatif ordinaire (PDF p. 371).

### Interprétation et application proposée (non attribuée à l'auteur)

Notre helper `AsReadonlyArray<T>` conserve le type existant si `T` est un tableau en lecture seule, et produit sinon `readonly T[]`. C'est une adaptation originale du mécanisme décrit dans le livre.

## Principe algorithmique ou architectural et recommandations

Choisir une transformation de type selon une relation `extends`, en conservant les tableaux existants. Recommandation Louvre : limiter cette abstraction aux besoins démontrés et vérifier explicitement les unions avant généralisation.

## Conditions, limites et compromis

Le caractère `readonly` est une contrainte TypeScript au moment de l'analyse statique et non un gel physique des objets. Attention aux unions distributives, aux types conditionnels récursifs et à leur lisibilité ; ces points ne sont pas analysés en détail dans la plage de pages citée.

## Exemple original, vérification et résultats

Ouvrir `technical-library/examples/type-patterns.ts`, section `TS15-003`. Vérifier le type d'un nombre scalaire et d'un tableau déjà déclaré.

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
