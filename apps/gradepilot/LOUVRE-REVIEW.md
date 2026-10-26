# GradePilot — Traçabilité technique Louvre

## Problème, différenciation et décisions

Moyenne scolaire et note nécessaire pour atteindre un objectif académique. StudyRecall (révisions) — pas de calcul de moyenne ni scénarios pondérés.

Architecture volontairement sans framework : `core.js` (fonctions métier vérifiables en Node), `app.js` (interactions DOM et état), `index.html` (sémantique accessible), `style.css` (mise en page spécifique), `sw.js` (coquille hors ligne), `tests/` (vérifications). Cette structure applique des **principes transposables** des ouvrages, sans prétendre utiliser un framework absent.

## Références exactes et adaptations appliquées

### 1. TS16-001

- **Identifiant et fiche lue** : `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 16, pages PDF 396–400. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : Core.grade et Core.validateState contrôlent les objets JSON avant calcul.

### 2. FULL08-001

- **Identifiant et fiche lue** : `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 8, pages PDF 160–174. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : tests/core.test.cjs vérifie poids, bornes et impossibilité de l’objectif.

### 3. NEXT08-001

- **Identifiant et fiche lue** : `NEXT08-001` — `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 8, pages PDF 212–226. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : app.js sépare tableau de notes local et métriques purement dérivées.

### 4. VUE02-001

- **Identifiant et fiche lue** : `VUE02-001` — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 2, pages PDF 40–47. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : app.js recalcule la moyenne après mutation et sérialise un état validé.

### 5. GHA04-001

- **Identifiant et fiche lue** : `GHA04-001` — `technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`.
- **Chapitre/pages physiques PDF documentées par la fiche** : Chapitre 4, pages PDF 59–75. Ces repères viennent de la fiche ; **les PDF originaux ne sont pas revendiqués lus pour cette mission**.
- **Adaptation originale effectivement implémentée** : workflow QA dédié vérifie Node et Chrome sur PR sans déployer.

## Qualité et preuve

- Vérifications locales à effectuer / résultats dans GitHub Actions : `node --test apps/gradepilot/tests/core.test.cjs`, `python apps/gradepilot/tests/browser.test.py`.
- Aucun succès Chrome prétendu avant confirmation du journal réel de la CI.
- Les tests métier vérifient les propriétés spécifiques à **GradePilot**, pas uniquement la création et la suppression de données.
- Workflow en lecture seule, aucune fusion automatique ; le déploiement GitHub Pages n'est autorisé que sur `main`.

## Limites

StudyRecall (révisions) — pas de calcul de moyenne ni scénarios pondérés. Les résultats sont locaux et ne reposent sur aucune donnée externe vérifiée. Les propriétés de stockage ou d'accessibilité ne sont pas certifiées pour tous les navigateurs.


## Audit de l'application n°21 — 26 octobre 2026 (v2)

### Défauts reproductibles par lecture de la v1
1. **Persistance trompeuse** : lors de l'ajout/édition et de la suppression, `state` était modifié avant `persist()` ; en cas de quota ou blocage du stockage, l'interface pouvait annoncer l'enregistrement d'une note restée uniquement en mémoire. v2 : validation et écriture avant mutation de l'état ; aucune annonce de succès après échec.
2. **Sauvegarde corrompue** : `reset` passait `blocked=false` avant confirmation d'écriture, avec risque d'écraser l'historique brut ; `import` faisait de même lors de tentatives infructueuses. v2 : toutes les mutations, y compris « Tout effacer », restent bloquées tant qu'une restauration JSON validée n'est pas réellement écrite. Export brut disponible.
3. **Arrondi de seuil** : `required.toFixed(2)` pouvait présenter une note arrondie **en-dessous** du strict minimum requis ; `minimumScore` arrondit au centième **supérieur** et les tests calculent la moyenne correspondante.
4. **Statut déjà acquis** : `requirement` renvoyait `feasible=false` pour une note requise négative alors que `status='already'`. v2 : `feasible=true` pour « already ».
5. **Moteur public partiellement non validé** : `weightedAverage` et `requirement` acceptaient un tableau de fiches non vérifiées ; v2 réutilise la validation commune du contrat de sauvegarde et refuse les nombres non finis.
6. **Indicateur manquant** : le score théorique à la prochaine évaluation n'était pas simulable directement. v2 ajoute une moyenne projetée en direct et une fourchette des valeurs atteignables.

### Adaptations originales, distinctes des ouvrages cités
- Calcul `minimumScore`, `projectedAverage`, fourchette minimale/maximale, avec tests aux frontières.
- Stockage transactionnel en navigateur, protection du stockage corrompu et export CSV neutralisé contre les formules.
- Interface enrichie et parcours Chromium : quota simulé, restauration JSON refusée et réussie, PWA et affichage mobile.

### Validation exigée
Les assertions des **36 tests métier** et le nouveau navigateur Playwright doivent être confrontés aux journaux GitHub Actions du **dernier commit** avant toute conclusion. Les références TS16-001, FULL08-001, NEXT08-001, VUE02-001, GHA04-001 sont des fiches du dépôt lues pour la conception ; elles ne certifient pas à elles seules les modifications de l'application. Aucune lecture intégrale supplémentaire des PDF revendiquée.

### Portée et limites
Mêmes sauvegardes `version=1`, même clé `localStorage`, aucune migration destructive. Maximum 200 notes, calcul sur l'échelle /20 uniquement ; aucune règle de validation d'enseignement supérieur ou arrondi institutionnel garanti. Le score minimum suppose une prochaine **unique** évaluation. Les données restent sur l'appareil, export conseillé.
