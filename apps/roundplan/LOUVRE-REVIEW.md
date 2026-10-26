# RoundPlan Web v2 — audit et correspondance technique Louvre

**Source effective :** cinq fiches de synthèse consultées dans `googGPT/Louvre`. Les références de pages PDF sont celles consignées dans ces fiches ; aucune nouvelle consultation directe des PDF originaux n'est revendiquée. Implémentation indépendante et originale, sans copie de code des livres.

| Ouvrage, source | Fiche exacte ; chapitre et pages physiques *rapportées* | Correspondance vérifiable | Compromis |
|---|---|---|---|
| **Total TypeScript: The Essentials**, `SRC-001` | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` ; ch. 16, p. 396–400 | `core.js`: `normalizeRecord` refuse fractionalité, NaN, valeurs hors bornes ; `validateBackup` rejette versions ou champs inattendus et ids dupliqués avant toute écriture | Fonctions runtime JS, sans compiler TypeScript inutilement |
| **The Complete Developer**, `SRC-002` | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` ; ch. 8, p. 160–174 | `tests/core.test.cjs` : tests purs des frontières de phases, temps DST, limites, sauvegardes ; `tests/browser.test.py` teste les interactions réelles, dont démarrer/pause/skip/export/offline | Node `node:test` plutôt que Jest pour éviter `npm install` |
| **Ultimate Next.js for Modern Web Applications**, `SRC-003` | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` ; ch. 8, p. 212–226 | `app.js` persiste seulement les fiches ; les indicateurs `compute`, phases `buildTimeline`, état du timer et progression sont **dérivés** et non stockés | Aucun besoin de Next.js, SSR ou API distante |
| **Building Real-World Web Applications with Vue.js 3**, `SRC-004` | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` ; ch. 7, p. 186–202 | Logique indépendante dans `core.js`, DOM et stockage dans `app.js`, préparation d'un éventuel portage mobile ultérieur | Vue, Quasar, Supabase et empaquetage natif non utilisés ni revendiqués |
| **Learning GitHub Actions**, `SRC-005` | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` ; ch. 9, p. 210–220 | `.github/workflows/louvre-roundplan-qa.yml` exécute tests syntaxiques, métier et Chromium en permission `contents: read` sur PR ; publication Pages seulement après fusion | Dépend de la réussite réelle des jobs CI pour valider la PR |

## Défauts corrigés depuis v1

1. `work` et `rest` pouvaient être décimaux malgré leur affichage en secondes ; désormais seuls des entiers bornés sont acceptés.
2. Le chronomètre n'existait pas : une durée théorique ne suffisait pas. `performance.now()` mesure réellement le temps et permet pause/reprise/saut/réinitialisation. `locatePhase()` est une fonction pure pour les frontières de phase et la fin de séance.
3. Repos : la règle *entre rounds mais jamais après le dernier round d'un exercice* est rendue explicite, testée, et conservée.
4. Les durées de séance excessives sont rejetées (maximum 24 h) et les erreurs d'import empêchent de modifier le stockage local.
5. Les anciens programmes (v1) restent compatibles sous la même clé locale. Les modifications du plan réinitialisent volontairement le chronomètre en cours.
6. Le lien sortant « Louvre ↗ » a été retiré de l'interface, comme demandé sur les applications précédentes.
7. Trois modèles facultatifs, réorganisation des exercices et export CSV des phases. Service Worker mis à jour en `shell-v2`.

## Contrôles, confidentialité et limites

- Exécuter `node --test apps/roundplan/tests/core.test.cjs` et `python apps/roundplan/tests/browser.test.py`. Se fier aux **journaux observés** de GitHub Actions, jamais au simple fait qu'un test a été créé.
- Aucun service facturable, compte, réseau, tracking ni dépendance runtime externe.
- Stockage limité à un navigateur ; sauvegarde JSON nécessaire si l'on change d'appareil ou efface les données.
- Audio facultatif via Web Audio API ; le navigateur peut l'empêcher. Pas de véritable fonctionnement à l'arrière-plan lorsque l'onglet est fermé ni d'accès permanent au système de notifications.
- Séances d'activité physique : les modèles sont indicatifs, et non des instructions d'entraînement adaptées à une condition médicale ou à la sécurité d'un utilisateur.