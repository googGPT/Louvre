# EventCount v2 — revue technique fondée sur les cinq livres Louvre

**Provenance :** inspection du code EventCount de la PR #29, puis consultation des cinq références documentées dans le dépôt Louvre. Les pages indiquées sont les pages physiques PDF **rapportées dans ces fiches**, pas une nouvelle vérification des PDF originaux. Le code de la présente application est original.

| Livre Louvre | Fiche et pages documentées | Implémentation effectivement vérifiable | Limite |
|---|---|---|---|
| *Total TypeScript: The Essentials* (`SRC-001`) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, p. 396–400 | `core.js` : `normalizeRecord`, `validateBackup` validant la forme, l'ID, la réponse, les quantités et le montant en centimes à l'exécution avant tout stockage | JavaScript vanilla, pas de compilateur TypeScript utilisé ici |
| *The Complete Developer* (`SRC-002`) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, p. 160–174 | `tests/core.test.cjs` : budget, arrondis, invités, doublons, CSV malveillant et sauvegardes ; `tests/browser.test.py` : parcours création et restauration dans Chromium | Tests logiciels ; ne garantissent pas l'absence de défauts dans tout navigateur |
| *Ultimate Next.js for Modern Web Applications* (`SRC-003`) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`, chapitre 8, p. 212–226 | `core.js` : `compute()` dérive synthèses, groupe et budget depuis les invitations ; `app.js` ne persiste pas de totaux susceptibles de devenir incohérents | Aucun besoin de Next.js, SSR ou serveur dans ce site local |
| *Building Real-World Web Applications with Vue.js 3* (`SRC-004`) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chapitre 7, p. 186–202 | `core.js` expose algorithmes purs sans DOM ; `app.js` traite seulement affichage, formulaires et persistance, facilitant une enveloppe mobile future | Aucun usage revendiqué de Vue, Quasar ou Supabase |
| *Learning GitHub Actions* (`SRC-005`) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, chapitre 9, p. 210–220 | `.github/workflows/louvre-eventcount-qa.yml` : droits `contents: read`, aucun secret/API, `node --test` puis test Chromium de bout en bout ; aucune publication directe de PR | CI exécutée dans GitHub à vérifier explicitement avant fusion |

## Audit : défauts identifiés dans EventCount v1

1. Un seul compteur additionnait les réponses de **plusieurs événements**, sans possibilité de voir les budgets isolément.
2. Les « peut-être » étaient comptabilisés en personnes mais **ignorés du budget maximal possible**.
3. Aucune détection de doublons de personnes au sein d'un événement, ni de rapprochement des variantes typographiques de son titre.
4. Affichage générique : pas de statut rapide, pas de ventilation par événement, pas de CSV, pas d'exemple.
5. L'en-tête contenait un lien de retour « Louvre ↗ » sans rapport nécessaire avec la fonction utilisateur : retiré.

## Corrections et compromis

- Modèle de stockage **v1 inchangé** (`app: eventcount`, `version:1`, `records:[{id,event,guest,reply,seats,cost}]`) pour ne pas casser les sauvegardes historiques.
- Les montants unitaires sont validés à **deux décimales maximum**, puis convertis en centimes **avant multiplication par le nombre de personnes**.
- Budget minimum = groupes « oui », maximum = « oui » + « peut-être ». Les invités ayant répondu « non » n'engagent aucun coût dans les projections.
- Détection par `key()` (normalisation Unicode NFD, accents/casse, espaces multiples). Les doublons déjà présents dans une ancienne sauvegarde sont **signalés** mais pas effacés ou fusionnés sans consentement.
- Export CSV depuis le filtre courant avec neutralisation basique des préfixes de formule : la compatibilité des tableurs et la protection complète ne peuvent pas être garanties.
- Les champs d'import sont validés avant toute modification ; remplacement seulement après confirmation. En cas de stockage initial corrompu, export brut toujours possible et import valide explicitement autorisé.
- Service Worker versionné `shell-v2`, limité au répertoire de l'application ; offline disponible seulement après mise en cache valide.

## Vérifications

- Tests métier et syntaxiques à exécuter localement et dans GitHub Actions ; rapporter uniquement leurs résultats réellement observés.
- Tester Chromium réel : filtres, RSVP rapide, exemple, doublons, CSV, export/import, persistance, offline, largeur mobile 390px.
- Ne pas fusionner dans `main` si le test du workflow GitHub échoue.

**Aucune API payante, aucun hébergement nouveau ni bibliothèque runtime externe.**