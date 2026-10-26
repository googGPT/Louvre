# Revue Louvre — ChoreWheel v2 (application 15)

## Provenance

Références **issues des fiches techniques du dépôt Louvre**, pas d'une relecture des cinq PDF originaux pendant cette exécution. Les principes ont fait l'objet d'une adaptation originale, sans reprendre du code ou des textes des livres.

| Livre | Fiche technique, chapitre et pages PDF rapportés | Application exacte |
|---|---|---|
| *Total TypeScript: The Essentials* (`SRC-001`) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, ch. 16, p. 396–400 | `core.js` : `normalizeRecord` et `validateBackup` valident tous les champs en runtime et migrent de façon compatible les anciens enregistrements. Les protections JS ne sont pas présentées comme du TypeScript compilé. |
| *The Complete Developer* (`SRC-002`) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, ch. 8, p. 160–174 | Fonctions pures `summary`, `markDone`, `workload`, `ics` et tests Node/Chromium couvrant cas nominaux et frontières temporelles. |
| *Ultimate Next.js for Modern Web Applications* (`SRC-003`) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`, ch. 8, p. 212–226 | Les tâches sont persistées ; les métriques (retards, échéances, minutes/semaine) sont dérivées à chaque rendu de l'état courant sans compteurs persistés. Pas de Next.js ou SSR forcé. |
| *Building Real-World Web Applications with Vue.js 3* (`SRC-004`) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, ch. 7, p. 186–202 | Séparation stricte du moteur pur `core.js` et du code navigateur `app.js`, facilitant un futur portage sans prétendre utiliser Quasar. |
| *Learning GitHub Actions* (`SRC-005`) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, ch. 9, p. 210–220 | Workflow `.github/workflows/louvre-chorewheel-qa.yml` en lecture seule (`contents: read`), parcours Chrome en CI et publication uniquement après fusion autorisée. |

## Audit et corrections

1. **Durées fractionnaires** initialement acceptées. Elles sont rejetées : fréquence entière de 1 à 3650 jours ; durée entière de 1 à 1440 minutes.
2. **Pas de validation de réalisation** : bouton Fait + suivi des dates, prochaine échéance recalculée ; pas de faux historique inventé lors d'un import de la v1.
3. **Répartition brute trompeuse** : remplacement par charge **hebdomadaire estimée** `minutes × 7 / intervalle`; affiche correctement l'impact des tâches fréquentes.
4. Dates locales gérées par calcul de jour à midi UTC contre les écarts de durée de 23/25 heures aux changements d'heure.
5. Contrôle de l'import JSON, confirmation avant remplacement, export brut disponible en cas de corruption et aucune écriture en mode verrouillé.
6. Lien « Louvre ↗ » supprimé comme demandé ; nouveau cache PWA v2 ; interface mobile reconstruite.

## Limitations documentées

- La prochaine échéance est calculée à partir de **la dernière réalisation déclarée**, pas d'un calendrier complexe de jours fixes. Marquer Fait recommence le cycle à la date du jour.
- Marquer Fait est impossible si la dernière réalisation déclarée est dans le futur : l'utilisateur doit corriger la date.
- L'historique conserve 100 dates distinctes maximum. Ce n'est pas un journal d'heures réellement réalisées ; la charge hebdomadaire reste théorique.
- Le fichier ICS décrit des récurrences en dates civiles sans rappel programmé ; l'utilisateur doit l'importer manuellement et le réimporter après modification.
- Le mode hors ligne dépend de l'installation préalable du Service Worker, du navigateur et de ses quotas. Aucun compte, notification de fond, synchronisation ou service payant.

## Tests

- `node --test apps/chorewheel/tests/core.test.cjs` : validations, compatibilité v1, états tard/aujourd'hui/à venir, différences DST, suivi Fait, prévisions hebdomadaires, CSV/ICS et archives corrompues.
- `python apps/chorewheel/tests/browser.test.py` : parcours navigateur avec stockage, édition, filtres, exports, imports, PWA hors ligne et affichage mobile.
- Contrôles CI GitHub Actions via la PR existante ; **ne pas déclarer réussite tant que le résultat du job est inconnu**.