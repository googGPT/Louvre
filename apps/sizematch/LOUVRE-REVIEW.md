# SizeMatch v2 — Louvre Technical Review

## Audit source et correction originale

1. `core.js` de la PR #35 refusait `value<0` sans tenir compte de la catégorie : les températures négatives valides ne pouvaient pas être sauvegardées. `convert()` corrige cette restriction avec vérification du zéro absolu. L'audit complémentaire a supprimé une normalisation qui écrasait à zéro les températures de très faible amplitude (par exemple `1e-13 K`), et écarté la tolérance autorisant des températures très légèrement inférieures au zéro absolu. Six tests de non-régression supplémentaires couvrent ces cas.
2. Les conversions étaient formatées systématiquement via `toFixed(3)` : des petites valeurs pouvaient apparaître nulles. `formatValue()` utilise une précision significative et la notation scientifique lorsque nécessaire.
3. La première interface affichait seulement une liste. La v2 ajoute le résultat direct, des catégories sûres et un véritable historique filtrable.
4. Les unités US sont distinguées des unités impériales ; les facteurs restent des constantes documentées. Les nombres JavaScript conservent leurs limitations de précision intrinsèques.

## Cinq ouvrages : fiches effectivement lues dans la bibliothèque du dépôt

| Source | Fiche et chemin vérifiés | Pages PDF **rapportées par la fiche** | Application originale |
|---|---|---|---|
| SRC-001 — *Total TypeScript: The Essentials* | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | chap. 16, 396–400 | `core.js` : normalisation des entrées/JSON et vérification des dimensions et nombres à l'exécution. Aucune compilation TypeScript revendiquée. |
| SRC-002 — *The Complete Developer* | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | chap. 8, 160–174 | `tests/core.test.cjs` vérifie les cas limites et constantes ; `tests/browser.test.py` vérifie les interactions et la sauvegarde réelle. |
| SRC-003 — *Ultimate Next.js for Modern Web Applications* | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | chap. 8, 212–226 | Résultats dérivés par `compute()` et `refresh()` ; l'historique seul est persistant, pas le rendu. Pas de framework lourd imposé. |
| SRC-004 — *Building Real-World Web Applications with Vue.js 3* | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | chap. 7, 186–202 | Cœur portable pur `core.js`, adaptation navigateur isolée dans `app.js`, stockage local sans serveur. Pas d'intégration Quasar fictive. |
| SRC-005 — *Learning GitHub Actions* | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | chap. 9, 210–220 | `.github/workflows/louvre-sizematch-qa.yml` limite `permissions: contents: read`, sans interpolation de titres de PR dans un script. |

Les références et repères PDF proviennent des fiches Louvre consultées via GitHub. Les PDF originaux ne sont **pas** présentés comme relus dans ce cycle. Toutes les conversions et décisions UI sont des adaptations originales.

## Tests et limites

- Tests prévus : `node --check core.js`, `node --check app.js`, `node --test tests/core.test.cjs`, `python tests/browser.test.py` et CI globale du dépôt. Le succès d'un test doit être confirmé par le journal d'exécution.
- Export CSV : neutralisation des formules dans les chaînes utilisateur, séparateur `;`, UTF-8 BOM ; **seul JSON restaure l'historique**.
- Pas d'API, pas de réseau de mesure, pas de gestion de monnaie ; stockage navigateur effaçable et pas de chiffrement local. Maximum 500 fiches et JSON limité à 900 Ko.
- Le calcul reste IEEE-754 `Number`, sans garantie métrologique ou comptable ; affichage à 9 chiffres significatifs, zéro absolu contrôlé avec tolérance d'arrondi numérique.
- Le cache PWA `shell-v3` remplace les caches antérieurs après activation du nouveau service worker. La mise à jour explicite du service worker est nécessaire pour que les navigateurs ayant déjà mis `core.js` en cache reçoivent le correctif.