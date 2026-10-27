# FileIntegrity — Références Louvre et implémentation

1. **Total TypeScript** — `TS16-001`, `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, PDF pages 396–400 : validations strictes du nom, de la taille et du format SHA-256 dans `core.js`, sans assertions trompeuses.
2. **The Complete Developer** — `FULL08-001`, `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, PDF pages 160–174 : `tests/core.test.cjs` compare Web Crypto à un résultat crypto Node de référence et couvre les erreurs.
3. **Ultimate Next.js** — `NEXT10-001`, `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, chapitre 10, PDF pages 248–263 : une suite séparée `tests/browser.test.py` valide l'interaction réelle, pas simplement l'algorithme.
4. **Vue.js 3** — `VUE07-001`, `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chapitre 7, PDF pages 186–202 : frontière isolée `core.js` / `app.js`, permettant un futur emballage mobile.
5. **Learning GitHub Actions** — `GHA09-001`, `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, chapitre 9, PDF pages 210–220 : CI read-only, pas de scripts interpolant des entrées utilisateurs ; publication uniquement sur `main` après fusion autorisée.

**Source de citation** : fiches du dépôt consultées, non PDF originaux relus pendant cette mission. SHA-256 est une API native du navigateur, pas une technologie revendiquée comme développée par les livres. Ne pas assimiler intégrité et antivirus.
