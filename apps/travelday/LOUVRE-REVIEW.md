# TravelDay v2 — Revue technique Louvre

## Constat vérifié dans la PR initiale #34

- `summarize()` comparait uniquement les étapes adjacentes dans une liste triée. Une activité longue couvrant deux autres non adjacentes donnait un **faux négatif** : conflit entre l'activité longue et la dernière étape non détecté.
- Le budget sommait des nombres décimaux puis arrondissait le total, au lieu de sommer les coûts de chaque étape arrondis au centime.
- Aucun regroupement par journée, aucune alerte de marge de transfert, aucun export calendrier ou CSV ; horaires de fin avant début rejetés même si l'activité se termine réellement le lendemain.
- Lien « Louvre ↗ » supprimé des deux points d'entrée `index.html` et `index.htm`.

## Réalisation et risques

1. `core.js`: `normalizeRecord`, `validDate`, `timeMinutes` et `moneyCents` contrôlent toutes les entrées (y compris import JSON) ; limites 500 fiches, 1 000 000 € par activité. Ancien format v1 accepté, sans données fictives ajoutées.
2. `core.js`: `interval` place les activités sur un axe de minutes **civiles**, `conflictsOf` compare toutes les paires (O(n²), n≤500). Une fin avant le début indique le lendemain. À changement de fuseau ou de règle DST, la durée réelle peut différer de la durée civile affichée : **pas de simulation de fuseaux**.
3. `core.js`: `analyze` calcule budgets, durées et conflits à partir des entrées validées ; les filtres d'affichage ne modifient pas les données persistées. `toCsv` neutralise les débuts de cellules susceptibles d'être interprétés comme formules ; `toIcs` échappe les caractères réservés et produit des heures flottantes.
4. `app.js`: composants DOM via `textContent` (pas d'HTML injecté), actions explicites, erreurs visibles, filtre par jour, aperçu des conflits, impression, restauration validée avec confirmation avant remplacement. `localStorage` conservé sous `louvre-factory:travelday:v1`.
5. `sw.js`: cache PWA version v2, cache uniquement des ressources de cette application, sans cacher les pages tierces.

## Sources Louvre : **fiches du dépôt**, pas nouvelle lecture des PDF

| Ouvrage | Fiche et chemin | Chapitre / pages PDF rapportés par la fiche | Application originale |
|---|---|---|---|
| *Total TypeScript: The Essentials* (SRC-001) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | Ch. 16, pp. 396–400 | Validation réelle des entrées non fiables avant calcul ; JavaScript natif retenu sans attribuer des types TS au runtime. |
| *The Complete Developer* (SRC-002) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | Ch. 8, pp. 160–174 | `tests/core.test.cjs` et `tests/browser.test.py` couvrent cas limite, arrondi, activités englobantes, PWA et sauvegardes. |
| *Ultimate Next.js for Modern Web Applications* (SRC-003) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | Ch. 8, pp. 212–226 | Données source locales vs indicateurs dérivés : `analyze` calcule, aucun état analytique duplicatif ni SSR superflu. |
| *Building Real-World Web Applications with Vue.js 3* (SRC-004) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | Ch. 7, pp. 186–202 | Séparation du cœur métier `core.js` de l'UI `app.js` ; aucune dépendance Vue/Quasar/Supabase imposée. |
| *Learning GitHub Actions* (SRC-005) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | Ch. 9, pp. 210–220 | Workflow `.github/workflows/louvre-travelday-qa.yml` en lecture seule et tests de PR avant fusion, sans secret ni déploiement implicite. |

Les informations de chapitre et pages sont celles **documentées par les fiches** ; aucune consultation directe des PDF originaux n'est revendiquée dans cet audit. Les techniques transposées et leur code ont été écrits pour TravelDay, pas recopiés des livres.

## Preuves de test et contrôles à terminer

- Local : `node --check core.js`, `node --check app.js` et **52/52 tests Node réussis**.
- Navigateur local : tentative Playwright Chromium, échec **avant chargement de l'application** (`ERR_BLOCKED_BY_ADMINISTRATOR` sur localhost) ; résultat navigateur non validé localement.
- GitHub Actions : vérifier dans la PR #34 les résultats « QA Louvre App XX — TravelDay », « Louvre knowledge integrity » et « Deploy Louvre web apps to GitHub Pages ». Les résultats seront consignés dans la PR après exécution ; ne pas déduire de leur existence qu'ils ont réussi.
- Aucune branche `main` fusionnée automatiquement ; application non publique tant que la PR n'est pas intégrée.