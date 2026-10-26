# SplitFair — référence aux cinq livres Louvre

Sources : **fiches Louvre consultées**, non pas une nouvelle lecture intégrale des PDF.

| Livre | Source vérifiable dans Louvre | Décision technique appliquée |
|---|---|---|
| Total TypeScript | SRC-001 · TS16-001 · `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` · chap. 16 · PDF p. 396–400 | `core.js:valid` rejette les sauvegardes incohérentes |
| The Complete Developer | SRC-002 · FULL08-001 · `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` · chap. 8 · PDF p. 160–174 | Tests déterministes des sommes et erreurs |
| Ultimate Next.js | SRC-003 · NEXT08-001 · `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` · chap. 8 · PDF p. 212–226 | Soldes et transferts dérivés, jamais enregistrés en doublon |
| Vue.js 3 | SRC-004 · VUE07-001 · `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` · chap. 7 · PDF p. 186–202 | Logique métier indépendante du DOM, réutilisable sur mobile |
| Learning GitHub Actions | SRC-005 · GHA09-001 · `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` · chap. 9 · PDF p. 210–220 | Tests CI en lecture seule et publication séparée |

Pagination physique PDF rapportée par les fiches, **pas revérifiée dans cette exécution**. Pas d'obligation de framework Next.js ou Vue. Les transferts sont indicatifs, pas nécessairement globalement minimaux. Aucune banque connectée ni synchronisation. Les données restent dans localStorage et l'utilisateur est responsable de ses sauvegardes.
