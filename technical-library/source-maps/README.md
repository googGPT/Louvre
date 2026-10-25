# Louvre — Index initial vérifié des cinq ouvrages

**Statut : inventaire documentaire, PAS extraction exhaustive ni validation de code.**

Cet inventaire est établi à partir des **signets internes** des PDF fournis dans la conversation. Les numéros indiquent les **pages physiques du PDF (commençant à 1)**, qui peuvent différer des numéros de pages imprimés dans l'ouvrage. Les intitulés sont des intitulés de chapitres, pas une reproduction de leur contenu.

Aucun PDF ou extrait substantiel de livre ne figure dans ce livrable. Les résumés futurs doivent être originaux et présenter des citations vérifiables.

## Portée de la vérification dans Louvre

Ces cartographies ont été importées depuis le fichier fourni `Louvre_ETAPE2_source_maps.zip`. Les mentions « vérifié », « PDF analysé » et les contrôles des signets ci-dessous décrivent la provenance déclarée du livrable fourni, pas une consultation des PDF dans cette tâche. Les PDF originaux ne sont pas accessibles ici et leurs empreintes, métadonnées et pages n'ont pas été revérifiées contre les fichiers originaux.

L'intégration contrôle la cohérence interne de l'inventaire : cinq ouvrages, 70 chapitres, numérotation continue et pages de début croissantes dans les limites déclarées. Elle ne constitue ni une lecture analytique ni une extraction de connaissances. Les identifiants, titres, pages et empreintes fournis sont conservés sans correction conjecturale. Les liens relatifs du présent README ont été corrigés pour leur emplacement dans le dépôt.

## Volumétrie et provenance

| ID | Livre | Pages PDF | Chapitres | SHA-256 du PDF analysé |
|---|---|---:|---:|---|
| `TS-2026` | Total TypeScript: The Essentials | 435 | 16 | `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975` |
| `FULL-2024` | The Complete Developer | 347 | 16 | `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d` |
| `NEXT-2026` | Ultimate Next.js for Modern Web Applications | 354 | 14 | `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf` |
| `VUE-2024` | Building Real-World Web Applications with Vue.js 3 | 318 | 10 | `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` |
| `GHA-2023` | Learning GitHub Actions | 414 | 14 | `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` |

## Livrables à intégrer à la bibliothèque

Le dossier `technical-library/source-maps/` peut recevoir les cinq fiches de cartographie ci-jointes. Elles s'ajoutent au catalogue déjà préparé mais ne le remplacent pas.

**Important :** conserver les PDF uniquement dans un espace de travail privé autorisé ; ne pas les committer dans le dépôt public Louvre.

## Cartographies

- [total-typescript](total-typescript.md)
- [complete-developer](complete-developer.md)
- [ultimate-nextjs](ultimate-nextjs.md)
- [vuejs-3-real-world](vuejs-3-real-world.md)
- [github-actions](github-actions.md)
