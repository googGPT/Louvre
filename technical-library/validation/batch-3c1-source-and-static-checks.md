# Louvre — Validation documentaire du lot 3C1

**Périmètre :** 10 fiches nouvelles, deux par ouvrage, portant sur des chapitres ciblés. Ce lot ne prétend pas couvrir intégralement les chapitres concernés.

## Provenance des sources

| Identifiant source | Pages PDF | SHA-256 du PDF inspecté |
|---|---:|---|
| TS-2026 | 435 | `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` |
| FULL-2024 | 347 | `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d` |
| NEXT-2026 | 354 | `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` |
| VUE-2024 | 318 | `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` |
| GHA-2023 | 414 | `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` |

## Références inspectées

| Fiche | Chapitre | Pages physiques PDF examinées | Statut |
|---|---:|---|---|
| `TS05-001` | TS-2026 chap. 5 | 127–133 | Lecture ciblée et extraction contrôlées |
| `TS10-001` | TS-2026 chap. 10 | 228–233 ; 242–244 | Lecture ciblée et extraction contrôlées |
| `FULL06-001` | FULL-2024 chap. 6 | 124–125 ; 131–138 | Lecture ciblée et extraction contrôlées |
| `FULL08-001` | FULL-2024 chap. 8 | 160–169 ; 169–174 | Lecture ciblée et extraction contrôlées |
| `NEXT03-001` | NEXT-2026 chap. 3 | 72–77 ; 83–95 | Lecture ciblée et extraction contrôlées |
| `NEXT06-001` | NEXT-2026 chap. 6 | 160–173 ; 175–185 | Lecture ciblée et extraction contrôlées |
| `VUE05-001` | VUE-2024 chap. 5 | 133–144 | Lecture ciblée et extraction contrôlées |
| `VUE08-001` | VUE-2024 chap. 8 | 229–231 ; 234–240 | Lecture ciblée et extraction contrôlées |
| `GHA07-001` | GHA-2023 chap. 7 | 144–158 | Lecture ciblée et extraction contrôlées |
| `GHA09-001` | GHA-2023 chap. 9 | 210–211 ; 213–220 | Lecture ciblée et extraction contrôlées |

## Contrôles réalisés

- Inspection de texte et contrôle visuel d’un échantillon de 10 pages représentatives couvrant les cinq livres. Les passages ciblés de chaque fiche ont aussi été consultés en extraction de texte.
- Empreintes SHA-256 recalculées sur les cinq PDF présents dans cette conversation et confrontées aux cartographies existantes.
- Plages de pages contrôlées à l’intérieur des chapitres correspondants.
- Identifiants uniques et distincts des cinq fiches pilotes `TS15-001` à `TS15-005`.
- Toutes les nouvelles fiches sont originales ; aucun PDF ni long extrait reproduit.

## Contrôle statique du nouvel exemple TypeScript

- Outil : `Version 5.8.3`.
- Commande (depuis la racine du dépôt après import) :
  `tsc --strict --noEmit --target ES2022 --module ESNext technical-library/examples/cross-book-type-patterns.ts`
- Résultat **exécuté dans l’environnement ChatGPT** : code de sortie `0`, sortie standard et erreurs vides.
- Deux scénarios négatifs sous `@ts-expect-error` effectivement pris en compte (absence d’erreur `TS2578`).
- Aucun test runtime, Jest, Vue, Next.js, Docker ou GitHub Actions exécuté.
- Codex doit reproduire les tests lorsqu’il dispose d’un compilateur, ou distinguer résultats source et résultats locaux.

## Réserves

- Les principes des livres peuvent être datés ; la compatibilité avec les logiciels et actions GitHub actuels n’est pas confirmée.
- Les exemples hors TypeScript sont des propositions ou scénarios, **non des implémentations testées**.
- Le lecteur Codex ne dispose pas nécessairement des PDF privés. Ne pas présenter une fiche comme preuve d’une lecture directe du PDF par Codex.
- Les pages sont des numéros physiques du PDF, et non sa pagination imprimée.