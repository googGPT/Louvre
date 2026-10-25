# HomePulse Web 1.0 — décisions techniques documentées sur cinq ouvrages Louvre

La source de chaque ligne est une **fiche technique consultée dans le dépôt `googGPT/Louvre`**. Ce document n'affirme pas une relecture nouvelle des PDF originaux. Les pages physiques PDF sont celles *rapportées par les fiches Louvre*. Les choix de code ci-dessous sont des **adaptations originales**, pas des exemples ou garanties cités textuellement dans les ouvrages.

| Livre et source | Fiche Louvre / chapitre / PDF physique annoncé | Adaptation vérifiable dans l'application |
|---|---|---|
| **Total TypeScript: The Essentials** (2026), `SRC-001` | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chap. 16, p. 396–400 | `core.js`: `cleanEquipment`, `cleanEvent`, `cleanState` valident rigoureusement des données non fiables, dont photos, jours, catégories, identifiants et sauvegardes JSON **au runtime**. Aucune revendication d'utiliser réellement TypeScript côté navigateur. |
| **The Complete Developer** (2024), `SRC-002` | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chap. 8, p. 160–174 | Fonctions métier pures et suite `node:test` déterministe : dates autour de l'heure d'été, répétitions, coût, import altéré, ICS ; test Playwright vérifiant les interactions IndexedDB réelles. L'absence de Jest ne retire pas le principe des tests. |
| **Ultimate Next.js for Modern Web Applications** (2026), `SRC-003` | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`, chap. 8, p. 212–226 | Séparation de l'état persistant (`state.equipment`, `state.history`) et des **indicateurs dérivés** (`summary`, `status`, `byUrgency`), sans doubler les soldes dans IndexedDB ; pas de Next.js qui ajouterait des contraintes injustifiées à un site statique. |
| **Building Real-World Web Applications with Vue.js 3** (2024), `SRC-004` | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chap. 7, p. 186–202 | Séparation entre cœur métier, adaptateur de stockage et DOM ; future réutilisation des calculs dans un emballage mobile sans prétendre employer Quasar, Supabase ou Vue. |
| **Learning GitHub Actions** (2023), `SRC-005` | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, chap. 9, p. 210–220 | Test en droits minimaux `contents:read` ; seuls les jobs de déploiement reçoivent `pages:write` et `id-token:write`. Publication **de toutes les apps** uniquement après réussite des vérifications et merge vers `main`, jamais depuis une PR. |

## Choix algorithmiques

- **Jours civils en heure locale** (`YYYY-MM-DD`) avec vérification de validité stricte ; durée entre dates en UTC minuit pour éviter les glissements DST ; intervalle calendaire appliqué au jour local de l'intervention.
- **Coûts en centimes entiers**, plutôt que calculs successifs en nombres flottants.
- **Sauvegarde validée en totalité avant remplacement** ; transaction IndexedDB échouée ne modifie pas l'état affiché.
- **Archivage sans données calculées persistées** : le total de coûts et les priorités sont recalculés à partir de l'historique lors de l'affichage.
- **Photo compressée côté appareil** (canvas) et export volontaire ; aucune API d'OCR ni d'analyse d'image distante.
- **PWA à portée isolée** `/Louvre/apps/homepulse/`; elle ne prend pas le contrôle des autres apps Louvre.

## Tests, constats et limites

- Dans l'environnement de création : tests Node réussis (voir journal d'exécution de la création), `node --check` effectué. Le test Playwright local a été **bloqué** par la politique navigateur `ERR_BLOCKED_BY_ADMINISTRATOR` avant toute interaction ; ne pas revendiquer un succès navigateur local.
- GitHub Actions devra réaliser les tests Node + Playwright et la non-régression des quatre premières applications. Un succès d'API GitHub Pages seul ne garantit pas les opérations IndexedDB dans tous les navigateurs.
- Aucun délai technique prescrit comme norme : suggestions seulement, intervalles déterminés par l'utilisateur selon notices et réglementations applicables.
- Les données stockées sur l'appareil restent vulnérables à l'effacement du stockage du navigateur ; la synchronisation cloud et la notification quand l'application est fermée sont délibérément absentes.
- Cette application Web n'est **pas** une application mobile native. L'installation PWA dépend des possibilités du navigateur.

Aucun PDF protégé n'est copié dans GitHub ; aucune API payante, dépendance runtime hébergée, compte utilisateur ou donnée personnelle envoyée à un tiers n'est nécessaire.