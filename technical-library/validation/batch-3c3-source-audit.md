# Rapport de provenance — lot Louvre 3C3

- **Date :** 25 octobre 2026.
- **Périmètre :** 10 fiches provenant de 10 chapitres supplémentaires, deux par livre.
- **Méthode :** ouverture des cinq PDF privés avec PyMuPDF ; extraction des pages ciblées, vérification visuelle d'un échantillon représentatif de dix pages ; identification des notions, reformulation originale, séparation de faits attribués à l'auteur et de nos exemples.
- **Confidentialité :** aucun PDF, illustration extraite ou passage substantiel des livres n'est publié sur GitHub.
- **Vérifications :** empreintes SHA-256 des cinq fichiers contrôlées, index et chemins vérifiés par le validateur GitHub Actions sur la Pull Request ; exécution des exemples applicatifs non présumée.
- **Périmètre :** chaque fiche synthétise quelques pages précises et non le chapitre entier.
- **Risque de version :** Next.js, Nuxt, chart.js et GitHub Actions ont évolué ; lire les documents officiels de la version utilisée avant d'exécuter les exemples. En particulier, ne pas reprendre d'instructions historiques de désactivation TLS.

| Fiche | Source | Chapitre | Pages PDF | Examen ponctuel |
|---|---|---:|---|---|
| `TS06-001` | `SRC-001` | 6 | 159–167 | 159, 161, 166, 167 |
| `TS11-001` | `SRC-001` | 11 | 255–260 | 255, 257, 258, 259, 260 |
| `FULL10-001` | `SRC-002` | 10 | 203–211 | 203, 204, 205, 206, 207, 209, 210, 211 |
| `FULL16-001` | `SRC-002` | 16 | 283–287 | 283, 284, 285, 286, 287 |
| `NEXT02-001` | `SRC-003` | 2 | 43–67 | 43, 45, 48, 60, 62, 64, 66 |
| `NEXT10-001` | `SRC-003` | 10 | 248–263 | 248, 250, 252, 255, 259, 262, 263 |
| `VUE06-001` | `SRC-004` | 6 | 171–182 | 171, 172, 176, 177, 179, 180, 181, 182 |
| `VUE10-001` | `SRC-004` | 10 | 272–296 | 272, 279, 280, 281, 283, 284, 290, 295, 296 |
| `GHA05-001` | `SRC-005` | 5 | 89–109 | 89, 90, 91, 94, 95, 96, 100, 103, 108 |
| `GHA10-001` | `SRC-005` | 10 | 245–268 | 245, 248, 254, 255, 259, 263, 268 |

## Vérifications réellement exécutées dans ChatGPT

- **TypeScript :** `tsc --strict --target ES2022 --module commonjs --skipLibCheck --outDir /mnt/data/louvre_3c3_local_js technical-library/examples/validated-contracts-3c3.ts` — succès, TypeScript 5.8.3.
- **Node.js :** `node /mnt/data/louvre_3c3_local_js/validated-contracts-3c3.js` — 11 cas contrôlés (succès et rejets des patchs, nombres valides/invalides, agrégation mensuelle), succès, Node 22.16.0.
- Les exemples Docker, Next.js, Nuxt et GitHub Actions **n'ont pas été exécutés**.
- La CI GitHub Actions sera considérée validée seulement après observation du run lié au dernier commit de la PR.