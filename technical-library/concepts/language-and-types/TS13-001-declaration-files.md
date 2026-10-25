# TS13-001 — Fichiers de déclaration et frontière TypeScript–JavaScript

## Identification

- **Identifiant unique :** `TS13-001`
- **Domaine :** language-and-types
- **Mots-clés :** TypeScript, d.ts, declare module, global, moduleDetection, interfaces
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 13, *Modules, Scripts, and Declaration Files*.
- **Pages physiques PDF analysées :** 316–324 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 316, 317, 318, 319, 320, 321, 322, 323, 324.
- **SHA-256 du PDF source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Une API JavaScript ancienne ou un module tiers est utilisable à l’exécution, mais ne fournit pas de contrat de types fiable.

## Ce que le livre établit sur les pages indiquées

Le chapitre oppose modules (portée locale) et scripts (portée globale), montre le rôle de `export {}` et de `moduleDetection`, puis des fichiers `.d.ts` décrivant du JavaScript. Il insiste sur le fait que le compilateur ne compare pas automatiquement la déclaration au comportement réel du module décrit.

## Interprétation et décision d'ingénierie Louvre

Placer les déclarations de compatibilité près d’un adaptateur d’interface ; éviter d’introduire involontairement des variables globales. Écrire des tests contractuels exécutés contre le vrai paquet JavaScript pour vérifier que noms, arguments et retours correspondent aux `.d.ts`.

## Exemple original (pas un extrait du livre)

```ts
// Exemple d’un fichier declarations/legacy-math.d.ts
// declare module "legacy-math" {
//   export function roundMoney(amount: number): number;
// }
// Ce contrat DECRIT un module JS ; il ne crée pas l’implémentation.
export type LegacyMoneyPort = { roundMoney(amount: number): number };
export function validateLegacyMoneyPort(value: unknown): value is LegacyMoneyPort {
  return typeof value === "object" && value !== null &&
    "roundMoney" in value &&
    typeof (value as { roundMoney?: unknown }).roundMoney === "function";
}
```

## Limites et conditions d'usage

Une déclaration incorrecte compile malgré une API JS inexistante ou différente. Une garde qui vérifie seulement la présence d’une fonction ne garantit pas son comportement. Distinguer augmentations de module et déclarations qui remplacent des types ; vérifier selon l’option `moduleDetection` du projet.

## Vérification exigée dans un projet réel

Créer un faux module JS ou adaptateur pour un test de contrat ; vérifier aussi qu’une modification de nom côté JS fait échouer les tests runtime sans forcément faire échouer `tsc`.

## Connexions avec les autres fiches

- Fiche antérieure : `TS14-001-strict-compiler-config.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.