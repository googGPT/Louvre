# TS15-001 — Types génériques, valeurs par défaut et contraintes

> **Provenance de la validation :** les consultations du PDF et la compilation TypeScript 5.8.3 décrites dans cette fiche sont rapportées par le lot fourni depuis l'environnement source ChatGPT. Elles n'ont pas été reproduites dans cet environnement Codex : aucun accès effectif au PDF n'est établi ici et `tsc` n'est pas disponible localement. Le niveau de confiance déclaré ci-dessous est celui du livrable source, sans confirmation indépendante de l'attribution au livre. Voir le [rapport de validation](../../validation/TS15-static-typecheck.md).

## Identification

- **Identifiant unique :** `TS15-001`
- **Titre :** Types génériques, valeurs par défaut et contraintes
- **Domaine :** langage-et-types / modèles génériques
- **État :** source et exemple statique vérifiés ; **aucun essai d'intégration applicative ou runtime effectué**.

## Source et référence exacte

- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Catalogue :** `SRC-001` ; cartographie : `TS-2026` ; PDF privé SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Chapitre :** 15, *Designing Your Types*.
- **Accès :** PDF original ouvert et inspecté le 25 octobre 2026 dans la conversation ChatGPT ; **Codex ne peut pas être présumé avoir accès au PDF**.
- **Pagination :** pages physiques du PDF (base 1), distinctes de la pagination imprimée.
- **Pages physiques PDF :** 362–368.
- **Sections / repères :** Generic Types ; Multiple Type Parameters ; Default Type Parameters ; Type Parameter Constraints.
- **Pages imprimées :** non reportées dans cette fiche ; se référer au PDF.

## Problème technique traité

Deux réponses HTTP métier peuvent partager un état de chargement tout en transportant des contenus différents. Dupliquer l'union de statuts pour chaque domaine multiplie les risques d'incohérence.

## Explication du concept

### Faits établis par l'ouvrage

Le livre explique qu'un type générique accepte des paramètres de types pour factoriser une structure répétée entre plusieurs ressources. Le chapitre précise qu'il peut recevoir plusieurs paramètres, des valeurs par défaut (`=`) et des contraintes (`extends`). Ces contraintes décrivent des propriétés requises mais ne ferment pas l'objet aux propriétés supplémentaires (PDF p. 368).

### Interprétation et application proposée (non attribuée à l'auteur)

Dans l'exemple original, `LoadState<TContent extends Identified, TContext extends object = Record<string, never>>` impose un identifiant métier au contenu et permet des métadonnées de contexte facultatives au niveau du paramètre de type. `kind` discrimine l'état prêt de l'état absent.

## Principe algorithmique ou architectural et recommandations

Paramétrer une union discriminée par le contenu et son contexte ; utiliser une contrainte structurelle pour imposer `id`. Recommandation Louvre : garder les paramètres nécessaires au contrat, puis valider séparément les entrées externes au runtime.

## Conditions, limites et compromis

La contrainte ne valide rien à l'exécution et ne garantit pas l'absence de propriétés supplémentaires. Le paramètre `TContext` a une valeur par défaut, mais la propriété `context` reste exigée dans la branche `ready`. Éviter les paramètres génériques superflus.

## Exemple original, vérification et résultats

Ouvrir `technical-library/examples/type-patterns.ts`, section `TS15-001`. Vérifier le rétrécissement du type par `kind` et le cas rejeté où `id` manque.

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
