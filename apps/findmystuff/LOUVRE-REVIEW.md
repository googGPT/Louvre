# FindMyStuff Web 1.0 — revue technique Louvre (cinq livres)

**Sources effectivement consultées pour ce développement : les fiches techniques du dépôt `googGPT/Louvre`**, et **non** les PDF originaux lors de ce travail. Les pages sont des **repères déclarés dans ces fiches** (pages physiques PDF), pas des lectures PDF effectuées pendant cette implémentation. Les choix décrits ci-dessous sont **des adaptations originales** et non des citations des auteurs.

| Source Louvre | Fiche / chapitre / pages de PDF rapportées | Décision réalisée dans FindMyStuff | Limite |
|---|---|---|---|
| SRC-001 — *Total TypeScript: The Essentials* (2026) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, p. 396–400 | `core.js`: `validateItem()` et `validateBackup()` valident **à l'exécution** la forme des données avant toute écriture/ restauration | Aucun compilateur TypeScript nécessaire ; les tests runtime ne prouvent pas l'innocuité de toutes les images ou navigateurs |
| SRC-002 — *The Complete Developer* (2024) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, p. 160–174 | Les fonctions de recherche, échéances, CSV et validation sont pures et testées isolément via `node --test`; test de bout-en-bout Chromium séparé | Les tests ne remplacent pas des tests terrain sur plusieurs navigateurs |
| SRC-003 — *Ultimate Next.js for Modern Web Applications* (2026) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`, chapitre 8, p. 212–226 | État persistant IndexedDB distinct des filtres de recherche; `stats()` et `queryItems()` recalculent à partir des objets, sans duplication durable de compteurs | Pas de rendu serveur ou de Next.js : inutile à cette application locale |
| SRC-004 — *Building Real-World Web Applications with Vue.js 3* (2024) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chapitre 7, p. 186–202 | `core.js` sépare la logique métier de `app.js` et de l'adaptateur IndexedDB, pour faciliter un futur packaging Web/mobile | Pas de Quasar, Electron ou Supabase installés : portage natif non réalisé |
| SRC-005 — *Learning GitHub Actions* (2023) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, chapitre 9, p. 210–220 | Workflow existant : tests PR avec `contents: read`; publication sur `main` uniquement; les droits Pages élevés sont limités au job de déploiement | Recommandations du livre 2023 potentiellement à réévaluer face aux versions actuelles des actions |

## Algorithmes et choix applicatifs

- **Recherche pondérée accent-insensible** : comparaison de `name`, étiquettes, pièce et rangement, notes ; tous les termes de la requête doivent être trouvés. Règle d'ingénierie originale, **non attribuée aux auteurs**. Pas de réseau ni d'IA distante.
- **Prêt et échéance** : dates locales normalisées au format `YYYY-MM-DD`, différence de jours à midi UTC pour éviter les décalages estivaux, indicateur *en retard* uniquement si le retour est passé.
- **Archivage** : sauvegarde JSON vérifiée entièrement avant toute transaction IndexedDB de remplacement ; confirmation explicite. En cas d'échec de transaction, pas d'effacement partiel prévu.
- **Sécurité** : pas de code fourni par l'utilisateur exécuté, chaînes via `textContent`, photo compressée en JPEG Canvas, uniquement `image/jpeg|png|webp` acceptés avant transformation ; refus des Data URLs non-image dans les sauvegardes. Pas de CDN ni de tracker.
- **Export CSV** : cellules citées, quotes doublées, neutralisation des premiers caractères de formule tableur ; ne pas revendiquer une protection parfaite dans tous les tableurs.
- **PWA** : service worker limité à son propre `scope`, cache des fichiers du site après premier chargement réussi ; **aucune synchronisation** inter-appareils.

## Contrôles de qualité

- Exécuter : `node --test apps/findmystuff/tests/core.test.cjs`.
- Exécuter : `python apps/findmystuff/tests/browser.test.py` avec Playwright et Chromium accessibles.
- La CI existante doit exécuter tous les tests des six autres applications et faire apparaître FindMyStuff dans **le même artefact Pages**, sans écraser les répertoires frères.
- La PR **ne publie pas** le site tant qu'elle n'est pas fusionnée. Après fusion, vérifier `https://googgpt.github.io/Louvre/apps/findmystuff/` par HTTP, y compris `core.js` et `sw.js`.

## Limitations à présenter aux utilisateurs

- Aucun scan automatique de la maison, **les emplacements sont saisis manuellement**.
- Les photos et objets sont stockés dans **un navigateur précis** ; vider les données du site peut les effacer. Faire régulièrement l'export JSON ; le fichier contient des informations privées.
- Aucune notification système quand le site est fermé, même en cas de prêt en retard.
- Le `manifest` et le service worker permettent d'utiliser l'app comme **PWA Web**, sans affirmer qu'elle est déjà distribuée sur Android/iOS.
- L'hébergement GitHub Pages ne requiert aucune API payante mais reste soumis aux conditions/quota de GitHub.