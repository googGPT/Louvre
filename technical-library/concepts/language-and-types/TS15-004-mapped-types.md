# TS15-004 — Mapped types et remappage des clés

> **Provenance de la validation :** les consultations du PDF et la compilation TypeScript 5.8.3 décrites dans cette fiche sont rapportées par le lot fourni depuis l'environnement source ChatGPT. Elles n'ont pas été reproduites dans cet environnement Codex : aucun accès effectif au PDF n'est établi ici et `tsc` n'est pas disponible localement. Le niveau de confiance déclaré ci-dessous est celui du livrable source, sans confirmation indépendante de l'attribution au livre. Voir le [rapport de validation](../../validation/TS15-static-typecheck.md).

## Identification

- **Identifiant unique :** `TS15-004`
- **Titre :** Mapped types et remappage des clés
- **Domaine :** langage-et-types / dérivation de contrats
- **État :** source et exemple statique vérifiés ; **aucun essai d'intégration applicative ou runtime effectué**.

## Source et référence exacte

- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Catalogue :** `SRC-001` ; cartographie : `TS-2026` ; PDF privé SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Chapitre :** 15, *Designing Your Types*.
- **Accès :** PDF original ouvert et inspecté le 25 octobre 2026 dans la conversation ChatGPT ; **Codex ne peut pas être présumé avoir accès au PDF**.
- **Pagination :** pages physiques du PDF (base 1), distinctes de la pagination imprimée.
- **Pages physiques PDF :** 371–374 ; 384–387.
- **Sections / repères :** Mapped Types ; Key Remapping with as ; Exercises 15-8 et 15-9.
- **Pages imprimées :** non reportées dans cette fiche ; se référer au PDF.

## Problème technique traité

Créer manuellement un ensemble de fonctions de lecture pour chaque champ d'un modèle favorise les divergences entre modèle et API.

## Explication du concept

### Faits établis par l'ouvrage

Le livre présente la transformation d'un objet à partir de ses clés `[K in keyof T]`, l'accès au type des valeurs `T[K]`, puis le remappage des clés avec `as`. Les exercices de fin de chapitre dérivent des fonctions getter à partir d'une interface existante tout en conservant leurs types de retour (PDF p. 384–387).

### Interprétation et application proposée (non attribuée à l'auteur)

`GetterFunctions<T>` produit automatiquement `getTitle(): string` et `getScore(): number` à partir d'un modèle `Report`. Une condition `K extends string` écarte les clés numériques et symboliques pour permettre `Capitalize<K>`.

## Principe algorithmique ou architectural et recommandations

Itérer sur `keyof T`, dériver les noms avec `as` et conserver le type `T[K]`. Recommandation Louvre : implémenter les méthodes réelles séparément et vérifier les collisions avant d’exposer ce contrat.

## Conditions, limites et compromis

C'est une transformation purement statique : elle ne crée pas les méthodes JavaScript. L'objet réel doit les implémenter. Le remappage peut entraîner des collisions de noms si plusieurs clés produisent la même transformation ; celles-ci ne sont pas analysées dans le passage cité.

## Exemple original, vérification et résultats

Ouvrir `technical-library/examples/type-patterns.ts`, section `TS15-004`. Vérifier qu'un getter de score qui renvoie `string` est rejeté.

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

