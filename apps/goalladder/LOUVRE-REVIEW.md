# GoalLadder — Louvre Technical Review

## Objectif vérifiable
Visualiser les jalons terminés et les échéances. Application autonome Web statique, sans serveur ni service facturable. La logique métier est dans `core.js` ; `app.js` n'enregistre et ne présente que des données validées. Aucun framework n'est installé artificiellement.

## Cinq sources documentées effectivement consultées via les fiches GitHub Louvre

| Livre | Fiche exacte | Pages PDF **rapportées par la fiche** | Transposition originale vérifiable dans le code |
| --- | --- | --- | --- |
| *Total TypeScript: The Essentials* (`SRC-001`) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | 396–400 | `core.js`: `normalizeRecord`, validation à l'exécution de chaque champ avant stockage et restitution. |
| *The Complete Developer* (`SRC-002`) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | 160–174 | `tests/core.test.cjs` : scénarios nominaux, données malformées, frontières et tests purs ; `tests/browser.test.py` pour l'intégration. |
| *Ultimate Next.js for Modern Web Applications* (`SRC-003`) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | 212–226 | `core.js`/`app.js` : `compute` dérive les indicateurs du tableau courant sans enregistrer un état analytique supplémentaire. Aucun SSR nécessaire. |
| *Building Real-World Web Applications with Vue.js 3* (`SRC-004`) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | 186–202 | `core.js` expose des fonctions pures ; `app.js` isole le navigateur et le stockage, afin de faciliter un futur portage mobile. Pas de dépendance Quasar. |
| *Learning GitHub Actions* (`SRC-005`) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | 210–220 | `.github/workflows/louvre-goalladder-qa.yml` : `permissions: contents: read`, aucune interpolation de champs de PR dans des commandes shell, déploiement non autorisé par les tests. |

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


## Audit v2 — 26 octobre 2026 : constats et modifications

- **Bogue de statistiques** : un objet littéral indexé directement par le nom d'objectif (`goals[r.goal]`) entrait en collision avec le prototype JavaScript sur `__proto__`, `constructor` ou `toString`. Le regroupement métier utilise désormais `Map`, et les tests contrôlent ces noms.
- **Bogue d'échéance** : l'ancien `diffDays(due,today)<=7` comptait également toutes les étapes dépassées parmi celles "sous 7 jours". Les indicateurs séparent aujourd'hui les dates antérieures de la fenêtre [0 ; 7] jours.
- **Bogue de protection des données** : l'ancien import basculait `readOnly=false` **avant** de confirmer une écriture réussie ; une restauration échouée pouvait laisser le stockage corrompu déverrouillé. Le déverrouillage a désormais lieu uniquement après validation et succès de `localStorage.setItem`.
- **Nouvelle interface** : progression par objectif (tâches terminées / total), état des échéances et prochaine échéance ouverte, filtres et recherche sans accent, tris, passage rapide terminé/réouvert, export CSV contre les formules. Le rendu des données utilisateur utilise uniquement `textContent`.
- **Compatibilité de sauvegarde** : `app=goalladder`, `version=1`, mêmes champs métier et même clé LocalStorage ; pas de migration destructive.
- **Fiabilité des dates** : validation stricte des jours calendaires et calcul jour à jour en UTC pour les dates sans heures ; distinction explicite des étapes déjà terminées.
- **PWA** : mise à jour du nom de cache `louvre-goalladder-shell-v2` afin que les utilisateurs ayant chargé la v1 puissent obtenir les fichiers v2.

Les propositions algorithmiques et UX ci-dessus sont des développements **originaux de Louvre**, pas des affirmations attribuées directement aux cinq livres cités plus haut.

### Critères de validation de la v2

Vérifier dans le dernier job GitHub Actions : syntaxe JavaScript, contrôle du manifeste, scénarios Node, test Chromium du parcours complet, stockage corrompu, sauvegarde et restauration, affichage mobile 390 px, et chargement hors ligne. Toute étape en échec nécessite une correction avant fusion. Le succès observé doit être daté et rattaché au SHA effectivement testé.
