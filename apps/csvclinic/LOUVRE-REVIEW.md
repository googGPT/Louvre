# CSVClinic — Exploitation vérifiable des cinq livres Louvre

## Contrats de données

- **Total TypeScript**, fiche `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, pages PDF **396–400** selon la fiche : `parse()` rejette l'entrée mal formée, `normalizeTable()` valide le mode de déduplication. Application JavaScript originale du principe, sans prétendre utiliser TypeScript.
- **The Complete Developer**, fiche `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, pages PDF **160–174** : tests des guillemets, sauts de ligne, valeurs dupliquées et cas invalides dans `tests/core.test.cjs`.
- **Ultimate Next.js**, fiche `NEXT10-001` — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, chapitre 10, pages PDF **248–263** : tests purs + parcours Chrome indépendants (`tests/browser.test.py`), sans service API.
- **Vue.js 3**, fiche `VUE07-001` — `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chapitre 7, pages PDF **186–202** : core métier indépendant de l'adaptateur DOM/fichiers.
- **Learning GitHub Actions**, fiche `GHA04-001` — `technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`, chapitre 4, pages PDF **59–75** : workflow PR dédié, exécution déterministe Node + Chromium, lecture seule.

Ces références viennent des **fiches Louvre effectivement consultées**, pas d'une relecture des PDF originaux dans cette mission. Les règles CSV et de neutralisation des cellules sont des décisions d'implémentation originales, **non attribuées aux auteurs**. La couverture des tests ne certifie pas tous les dialectes CSV et l'export neutralise des formules uniquement dans les cellules qui commencent par certains caractères.
