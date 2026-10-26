# QuizCraft — Louvre Technical Review

## Objectif vérifiable
Mémoriser des questions et suivre ses réponses. Application autonome Web statique, sans serveur ni service facturable. La logique métier est dans `core.js` ; `app.js` n'enregistre et ne présente que des données validées. Aucun framework n'est installé artificiellement.

## Cinq sources documentées effectivement consultées via les fiches GitHub Louvre

| Livre | Fiche exacte | Pages PDF **rapportées par la fiche** | Transposition originale vérifiable dans le code |
| --- | --- | --- | --- |
| *Total TypeScript: The Essentials* (`SRC-001`) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | 396–400 | `core.js`: `normalizeRecord`, validation à l'exécution de chaque champ avant stockage et restitution. |
| *The Complete Developer* (`SRC-002`) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | 160–174 | `tests/core.test.cjs` : scénarios nominaux, données malformées, frontières et tests purs ; `tests/browser.test.py` pour l'intégration. |
| *Ultimate Next.js for Modern Web Applications* (`SRC-003`) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | 212–226 | `core.js`/`app.js` : `compute` dérive les indicateurs du tableau courant sans enregistrer un état analytique supplémentaire. Aucun SSR nécessaire. |
| *Building Real-World Web Applications with Vue.js 3* (`SRC-004`) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | 186–202 | `core.js` expose des fonctions pures ; `app.js` isole le navigateur et le stockage, afin de faciliter un futur portage mobile. Pas de dépendance Quasar. |
| *Learning GitHub Actions* (`SRC-005`) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | 210–220 | `.github/workflows/louvre-quizcraft-qa.yml` : `permissions: contents: read`, aucune interpolation de champs de PR dans des commandes shell, déploiement non autorisé par les tests. |

**Provenance :** références et pages issues des fiches Louvre lues dans le dépôt ; nous ne prétendons pas avoir relu chaque PDF dans cette exécution. Les principes attribués aux livres ne sont pas assimilés à des implémentations d'auteur ; tous les traitements des applications sont originaux.

## Limites et compromis
- Les calculs dépendent entièrement des entrées de l'utilisateur ; ils ne font pas intervenir de données externes en temps réel.
- Données stockées dans `localStorage` sous la clé propre à l'application. Perte possible si le navigateur supprime son stockage ; sauvegarde JSON indispensable.
- Maximum 500 enregistrements, export JSON limité à ~900 Ko ; rien n'est chiffré au repos dans le profil local.
- Service Worker : cache des ressources statiques après première visite et hors ligne si installation autorisée. Pas de synchronisation multiappareil ni notifications push.
- Certaines valeurs sont illustratives ou déclaratives ; **aucune garantie professionnelle, légale, financière ou de santé** n'est fournie.

## Vérifications prévues et observations
- Commandes : `node --check core.js && node --check app.js && node --test tests/core.test.cjs` ; puis `python tests/browser.test.py` (Playwright Chromium).
- Les résultats effectifs doivent être vérifiés dans les logs GitHub Actions de la Pull Request ; un code de test n'est pas une preuve d'exécution.
- Ne pas fusionner en cas d'échec de CI. Aucune modification de `main` dans la branche proposée.


## Audit complémentaire v2 — 26 octobre 2026

**Défauts repérés par lecture du code initial :**
1. Agrégation par thème effectuée sur l'objet `by={}` en utilisant `by[r.category]`. Des entrées `constructor`, `toString` ou `__proto__` pouvaient provoquer des collisions avec le prototype et des agrégats faux. Correction : `Map` et contrôles ciblés.
2. Un simple bouton « Révéler la réponse » n'était pas équivalent à une véritable session de quiz : aucun deck, score ni progression de session. Correction : génération d'une séquence mélangée, réponse initialement masquée, auto-évaluation conditionnée à la révélation, tableau de bord mis à jour.
3. Lors de la restauration, `readOnly=false` était appliqué **avant** d'assurer la réussite de `localStorage.setItem`. Correction : déverrouillage après validation et écriture réussies uniquement ; copie brute toujours disponible.
4. Documentation et workflow numéroté « WEB 01 » / « App XX » malgré la position 20, UI générique peu orientée quiz ; interface spécifique, mobile et accessible, et workflow renommé « App 20 ».

**Nouvelle portée :** cartes avec réponses masquées, filtre par thème/difficulté/maîtrise, recherche insensible aux accents, score de session, progression par thème, CSV protégé, validation stricte des imports. Compatibilité intégrale du format v1, sans migration destructive.

**Limites :** la « réussite » dépend de l'auto-déclaration de l'apprenant ; aucune correction automatique ou validité pédagogique externe garantie. Scores de session volatils ; seules les marques de maîtrise sont persistées. Les nouvelles fonctions et tests sont des travaux originaux et ne sont pas attribués aux ouvrages de la bibliothèque Louvre. Le cache PWA est passé à `louvre-quizcraft-shell-v2`.

**Vérifications requises :** syntaxe JS, tests Node, Playwright/Chromium, mobilité à 390 px, export/import et reprise après stockage corrompu, service worker hors ligne. Ne déclarer leur succès qu'après consultation du job correspondant au dernier SHA.
