# WorldMeet v2 — revue technique Louvre

## Périmètre

Audit de la PR Louvre #31 (application 14). Version initiale : calcul correct d'un horaire UTC vers un fuseau IANA, mais présentation isolée par participant, risque de confusion avec la saisie locale, absence de comparaison commune, de proposition de créneau ou d'ICS. Version 2 : agrégation par réunion + instant UTC, validation des dates réelles, prévisualisation, offsets et bascule DST, plages de travail paramétrables, suggestion sans réseau, téléchargement ICS, sauvegardes JSON v1 compatibles, nouvelle PWA et suppression du lien « Louvre ↗ ».

**Traçabilité :** fiches Github Louvre réellement consultées via le dépôt. Les numéros de pages correspondent aux pages PDF **indiquées dans les fiches**, et non à une nouvelle lecture des cinq PDF lors de cette modification. Toutes les fonctions ici sont originales, pas des copies de code des auteurs.

| Source | Fiche technique exacte | Pages du PDF rapportées | Application concrète (fichier) |
|---|---|---|---|
| `SRC-001`, *Total TypeScript: The Essentials* (2026) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` | Ch. 16, p. 396–400 | `core.js` : `validUTC`, `normalizeRecord`, `validZone`, `validateBackup` avant tout stockage ; aucun cast de données importées sans validation. |
| `SRC-002`, *The Complete Developer* (2024) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` | Ch. 8, p. 160–174 | `tests/core.test.cjs` : frontières DST et plages de travail, dates invalides, offsets non entiers, intégrité des sauvegardes ; `tests/browser.test.py` : vrai parcours Chromium, sauvegarde et hors ligne. |
| `SRC-003`, *Ultimate Next.js for Modern Web Applications* (2026) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` | Ch. 8, p. 212–226 | `core.js` et `app.js` : état persistant limité aux correspondances ; regroupements, horaires et suggestions sont **dérivés** à chaque rendu. |
| `SRC-004`, *Building Real-World Web Applications with Vue.js 3* (2024) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` | Ch. 7, p. 186–202 | `core.js` isole les conversions temporelles et l'algorithme de créneau d'une interface `app.js` et d'un navigateur statique, permettant un portage ultérieur sans framework forcé. |
| `SRC-005`, *Learning GitHub Actions* (2023) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` | Ch. 9, p. 210–220 | `.github/workflows/louvre-worldmeet-qa.yml` : workflow tests lecture seule, pas d'exécution d'une entrée de PR, tests métier et navigateur ; seules les modifications fusionnées peuvent être publiées par le workflow existant. |

## Qualité et transparence

- Critères temporels : UTC explicite sans conversion de la valeur de `datetime-local` par `Date` local ; `new Date(utc + ':00Z')` validée, `Intl.DateTimeFormat(timeZone=IANA)` pour l'affichage et les jours ; `localParts` pour l'heure et le décalage ; le moteur du navigateur fournit les règles de changement d'heure.
- Les suggestions par tranches de 30 minutes sont **heuristiques** et ne recherchent pas les disponibilités véritables, les jours de weekend, les jours fériés ou des calendriers connectés. En cas d'absence de créneau commun, l'interface l'indique explicitement.
- L'ICS encode les dates en UTC, utilise un UID local déterministe et échappe les caractères de séparation ; il ne crée pas de réservation extérieure.
- Validation anti-doublon par réunion normalisée et instant, participant normalisé et fuseau, sans bloquer la restauration d'anciennes données qui possèdent des doublons logiques.
- Protection contre l'injection de code : interface via `textContent`, pas de `innerHTML` ni d'exécution de fichiers importés.
- Stockage navigateur sous la clé d'origine `louvre-factory:worldmeet:v1`, format JSON `app:worldmeet,version:1,records`; état corrompu protégé, import vérifié avant écriture, confirmation de remplacement, export brut de secours.
- Service worker version v2 limité au `scope` et cache renouvelé ; pas de CDN ni de service payant.

## Tests reproductibles

Depuis la racine Louvre :
```
TZ=Europe/Paris node --test apps/worldmeet/tests/core.test.cjs
node --check apps/worldmeet/app.js
python apps/worldmeet/tests/browser.test.py
```
N'affirmer un test Chromium réussi que si le rapport GitHub Actions le confirme. Les tests unitaires valident aussi la compatibilité de `SPEC`, des formats JSON et de l'affichage « 15:00 » pour Paris en novembre 2026.