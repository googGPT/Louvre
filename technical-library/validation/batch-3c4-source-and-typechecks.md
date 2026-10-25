# Lot 3C4 — Sources, périmètre et tests réellement effectués

**Date :** 25 octobre 2026.

## Provenance et méthode

- Dix fiches nouvelles, **deux par livre**, issues de **dix chapitres qui ne disposaient pas de fiche** avant ce lot. Les contenus sont des synthèses originales ; aucun passage substantiel n'est reproduit.
- PDFs originaux lus localement avec PyMuPDF. **Empreintes SHA-256 recalculées** et identiques au catalogue existant (voir tableau ci-dessous). Les numéros correspondent aux **pages physiques PDF, indexées à partir de 1**.
- Chaque fiche contient deux sections distinctes : faits décrits par l'auteur, puis adaptations / préconisations Louvre. **Ce n'est pas une analyse exhaustive des chapitres.**
- Les PDF originaux demeurent privés et ne doivent pas figurer dans ce dépôt GitHub public.

| Livre | SHA-256 du PDF privé vérifié |
|---|---|
| *Total TypeScript: The Essentials* | `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` |
| *The Complete Developer* | `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d` |
| *Ultimate Next.js for Modern Web Applications* | `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` |
| *Building Real-World Web Applications with Vue.js 3* | `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` |
| *Learning GitHub Actions* | `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` |

## Pages réellement inspectées pour ce lot

| Fiche | Catalogue | Chapitre | Pages physiques PDF consultées |
|---|---|---:|---|
| `TS03-001` | `SRC-001` | 3 | 54, 55, 56, 58, 59 |
| `TS07-001` | `SRC-001` | 7 | 169, 170, 174, 175, 180, 181, 185, 187 |
| `FULL12-001` | `SRC-002` | 12 | 225, 227, 228, 230, 232, 234, 235 |
| `FULL13-001` | `SRC-002` | 13 | 237, 238, 239, 240, 241, 242, 243 |
| `NEXT04-001` | `SRC-003` | 4 | 100, 102, 103, 106, 108, 115, 116 |
| `NEXT11-001` | `SRC-003` | 11 | 265, 266, 267, 269, 272, 275, 282, 283 |
| `VUE04-001` | `SRC-004` | 4 | 82, 89, 92, 97, 101, 107, 108 |
| `VUE09-001` | `SRC-004` | 9 | 244, 245, 246, 247, 248, 250, 254, 260, 266 |
| `GHA06-001` | `SRC-005` | 6 | 113, 115, 118, 121, 125, 126, 128, 132, 134, 137 |
| `GHA11-001` | `SRC-005` | 11 | 281, 282, 283, 285, 286, 289, 310, 312, 313 |

## Contrôles techniques exécutés ici (environnement source ChatGPT)

- **TypeScript :** compilateur `tsc` version 5.8.3 ; compilation `--strict --target ES2022 --module commonjs` sur `validated-contracts-3c4.ts` et `validated-contracts-3c4.test.ts` : **réussie**.
- **Node.js :** version 22.16.0 ; exécution de `validated-contracts-3c4.test.js` : **23 assertions et chemins invalides ont été contrôlés, tous réussis**.
- Fonctions réellement exécutées : `sortScores`, `pageOffset`, `acceptedLabels`, `parseCreate`, `authorizeProjectEdit`, `getPublicProject`, avec un dépôt mémoire simulé.
- **Non exécutés** : compilation d'un vrai projet Next.js, navigateur Vue/Nuxt, modèle COCO-SSD, connexion MongoDB, serveur Apollo, environnement GitHub de déploiement, action composite locale ou application complète.
- Les instructions relatives aux outils de 2023–2026 doivent être revues pour la version d'utilisation ; ce travail ne garantit **pas la compatibilité en production**.

### Reproduction locale des contrôles TypeScript

```bash
mkdir -p /tmp/louvre-3c4-types
# Depuis la racine du dépôt :
tsc --strict --target ES2022 --module commonjs \
  --outDir /tmp/louvre-3c4-types \
  technical-library/examples/validated-contracts-3c4.ts \
  technical-library/examples/validated-contracts-3c4.test.ts
node /tmp/louvre-3c4-types/validated-contracts-3c4.test.js
```

## Contrôles du dépôt

Le validateur Python `scripts/validate_library.py` contrôle les **identifiants, liens relatifs et publication interdite de PDF**. La CI GitHub doit être observée après publication de la branche (on ne peut pas présumer de sa réussite). Les tests applicatifs ne sont pas remplacés par ce validateur.

## Couverture après intégration

- 45 fiches uniques, sur 41 chapitres partiellement étudiés parmi 70.
- 29 chapitres ne possèdent encore aucune fiche ; leur présence dans une cartographie n'est **pas** une lecture du contenu.