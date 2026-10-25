# TS15-005 — Résultat typé : distinguer succès et erreur

> **Provenance de la validation :** les consultations du PDF et la compilation TypeScript 5.8.3 décrites dans cette fiche sont rapportées par le lot fourni depuis l'environnement source ChatGPT. Elles n'ont pas été reproduites dans cet environnement Codex : aucun accès effectif au PDF n'est établi ici et `tsc` n'est pas disponible localement. Le niveau de confiance déclaré ci-dessous est celui du livrable source, sans confirmation indépendante de l'attribution au livre. Voir le [rapport de validation](../../validation/TS15-static-typecheck.md).

## Identification

- **Identifiant unique :** `TS15-005`
- **Titre :** Résultat typé : distinguer succès et erreur
- **Domaine :** langage-et-types / modélisation des résultats
- **État :** source et exemple statique vérifiés ; **aucun essai d'intégration applicative ou runtime effectué**.

## Source et référence exacte

- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026).
- **Catalogue :** `SRC-001` ; cartographie : `TS-2026` ; PDF privé SHA-256 : `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Chapitre :** 15, *Designing Your Types*.
- **Accès :** PDF original ouvert et inspecté le 25 octobre 2026 dans la conversation ChatGPT ; **Codex ne peut pas être présumé avoir accès au PDF**.
- **Pagination :** pages physiques du PDF (base 1), distinctes de la pagination imprimée.
- **Pages physiques PDF :** 375–379.
- **Sections / repères :** Exercise 15-1: Creating a DataShape Type Helper ; Exercise 15-3: Adding Defaults to a Result Type ; Exercise 15-4: Constraining the Result Type.
- **Pages imprimées :** non reportées dans cette fiche ; se référer au PDF.

## Problème technique traité

Les services doivent exprimer les erreurs métier prévisibles sans masquer la distinction entre réponse réussie et réponse échouée.

## Explication du concept

### Faits établis par l'ouvrage

Le chapitre factorise des réponses ayant une branche de données et une branche d'erreur. Il présente un type `Result` avec un discriminant de succès, un paramètre de type d'erreur par défaut et une contrainte portant sur la propriété `message`. L'exemple montre l'obligation de vérifier le discriminant avant d'accéder à la donnée de succès (PDF p. 377–379).

### Interprétation et application proposée (non attribuée à l'auteur)

L'exemple original utilise `Result<T, E extends {message:string} = Error>` et la clé `ok`. `parseAmount` retourne une branche `ok:true` avec un montant, sinon `ok:false` avec une erreur. Le consommateur doit examiner `ok` avant d'accéder à `value`.

## Principe algorithmique ou architectural et recommandations

Modéliser les issues attendues par une union discriminée et exiger le rétrécissement avant accès au résultat. Recommandation Louvre : compléter ce contrat par la validation des entrées et la gestion des exceptions inattendues.

## Conditions, limites et compromis

Un `Result` n'empêche pas les exceptions inattendues, ni les erreurs externes non validées ; il ne remplace pas automatiquement `try/catch`. En production, distinguer erreurs métier et erreurs d'infrastructure et ajouter la validation des entrées selon le contexte.

## Exemple original, vérification et résultats

Ouvrir `technical-library/examples/type-patterns.ts`, section `TS15-005`. Vérifier que l'accès direct à `result.value` sans garde de succès est refusé.

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
