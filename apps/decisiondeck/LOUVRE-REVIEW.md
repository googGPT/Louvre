# DecisionDeck v2 — revue de la bibliothèque Louvre

**Sources examinées :** fiches du dépôt `googGPT/Louvre` identifiées ci-dessous. Les pages sont celles **rapportées dans les fiches**, sans revendiquer une nouvelle lecture des PDF durant cette intervention. Les décisions de code sont des adaptations originales, non des méthodes attribuées à leurs auteurs.

| Livre | Fiche Louvre | Pages physiques PDF rapportées | Application technique effectivement réalisée |
|---|---|---|---|
| *Total TypeScript: The Essentials* (`SRC-001`) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | 396–400 | `core.js`: `normalizeRecord`, `validateBackup`, poids finis et positifs, notes bornées 0–10, sauvegarde v1 validée *au runtime*. Pas de compilation TypeScript revendiquée. |
| *The Complete Developer* (`SRC-002`) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | 160–174 | `tests/core.test.cjs`: calcul, stabilité, comparabilité, sensibilité, CSV et rétrocompatibilité ; `tests/browser.test.py`: parcours Chrome et stockage local réel. |
| *Ultimate Next.js for Modern Web Applications* (`SRC-003`) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | 212–226 | `core.js:compute` dérive les tableaux, graphiques et avertissements des notes sauvegardées ; `app.js` ne duplique pas de classements persistés. Aucun Next.js imposé à une app statique. |
| *Building Real-World Web Applications with Vue.js 3* (`SRC-004`) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | 186–202 | `core.js` reste indépendant du DOM, de `localStorage` et du rendu mobile (`app.js`), préparant la réutilisation future du moteur sans prétendre employer Vue ou Quasar. |
| *Learning GitHub Actions* (`SRC-005`) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | 210–220 | Workflow existant `.github/workflows/louvre-decisiondeck-qa.yml` : tests Node puis Chromium, `permissions: contents: read`; aucune fusion ou élévation des droits depuis une PR. |

## Audit métier et corrections

La v1 savait suspendre un classement en cas de critères manquants, de poids divergents et de doublons exacts. La v2 **préserve** ces contrôles, et en renforce la cohérence : les noms des options et critères sont rapprochés sans tenir compte de la casse, des accents ou des espaces superflus. Les variantes comme « Coût » et « cout » ne permettent donc plus de contourner un doublon ou de créer un critère artificiellement distinct.

Les scores sont toujours orientés : 10 = plus favorable, y compris pour un critère « coût » (prix inférieur = score supérieur). L'algorithme est une somme pondérée sur les mêmes critères ; il interdit de présenter un classement lorsque les critères ou poids ne sont pas comparables.

## Nouvelles fonctions

- Matrice notes / critères / poids / score final, avec contribution de chaque critère au score global.
- Visualisation des rangs sous forme de barres à échelle 0–10.
- Analyse de sensibilité univariée : pour chaque critère séparément, multiplier son poids par 0,5 ou 2, recalculer le rang 1, afficher un changement éventuel de leader. **Ne remplace pas une analyse globale de robustesse.**
- Exemple guidé, saisie de critères et options facilitée, poids existant réutilisé automatiquement, prévention de doublons avant sauvegarde.
- Export CSV local (échapper les cellules et préfixer celles pouvant être interprétées comme des formules), export/restauration JSON v1 inchangés.
- Retrait du lien « Louvre ↗ » dans `index.html` et `index.htm` ; les autres applications Louvre ne sont pas modifiées.
- Invalidation de l'ancien cache par changement `louvre-decisiondeck-shell-v1` → `v2`.

## Limites et vérifications

- Aucune donnée distante et aucune API payante ; résultats totalement dépendants des notes données par l'utilisateur.
- Les contrôles de la fiabilité multicritère exigent une grille comparable mais ne prouvent ni la justesse des préférences, ni l'indépendance des critères, ni la validité statistique d'une décision.
- Stockage local limité à 500 fiches ; effacer les données du navigateur peut provoquer leur perte. Exporter les sauvegardes régulièrement.
- `node --check core.js`, `node --check app.js`, `node --test tests/core.test.cjs` doivent être exécutés et enregistrés ; les résultats du test Chromium de GitHub Actions doivent être lus après lancement de la PR. Le navigateur local bloque `localhost` par `ERR_BLOCKED_BY_ADMINISTRATOR` dans l'environnement de génération.