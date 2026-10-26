# CSVClinic — Exploitation vérifiable des cinq livres Louvre

## Contrats de données

- **Total TypeScript**, fiche `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, pages PDF **396–400** selon la fiche : `parse()` rejette l'entrée mal formée, `normalizeTable()` valide le mode de déduplication. Application JavaScript originale du principe, sans prétendre utiliser TypeScript.
- **The Complete Developer**, fiche `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, pages PDF **160–174** : tests des guillemets, sauts de ligne, valeurs dupliquées et cas invalides dans `tests/core.test.cjs`.
- **Ultimate Next.js**, fiche `NEXT10-001` — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, chapitre 10, pages PDF **248–263** : tests purs + parcours Chrome indépendants (`tests/browser.test.py`), sans service API.
- **Vue.js 3**, fiche `VUE07-001` — `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md`, chapitre 7, pages PDF **186–202** : core métier indépendant de l'adaptateur DOM/fichiers.
- **Learning GitHub Actions**, fiche `GHA04-001` — `technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`, chapitre 4, pages PDF **59–75** : workflow PR dédié, exécution déterministe Node + Chromium, lecture seule.

Ces références viennent des **fiches Louvre effectivement consultées**, pas d'une relecture des PDF originaux dans cette mission. Les règles CSV et de neutralisation des cellules sont des décisions d'implémentation originales, **non attribuées aux auteurs**. La couverture des tests ne certifie pas tous les dialectes CSV et l'export neutralise des formules uniquement dans les cellules qui commencent par certains caractères.

## Audit technique v2 — reprise applicative n° 26

**État avéré au début de la revue :** la PR #42 existait déjà, branche codex/louvre-wave2-06-csvclinic. Le registre actuellement sur main la classait encore « piste non développée », mais ce registre n'existe pas dans l'ancienne base de cette branche : il ne faut pas le recréer ici, car cela écraserait les mises à jour plus récentes de main lors de la fusion.

### Bugs corrigés
- Export et aperçu périmés après un changement de source ou d'options ; remise à zéro immédiate des statistiques et téléchargement bloqué.
- Importation locale asynchrone : jeton de révision empêchant une lecture dépassée d'écraser des modifications plus récentes ; analyse bloquée pendant l'import.
- Parsing CSV et détection des séparateurs : inspection de plusieurs enregistrements, champs cités et multilignes, BOM initial, LF/CRLF/CR, limites structurelles, messages de lignes incorrectes.
- Taille maximale mesurée en octets UTF-8 ; nombre de colonnes limité lors du parsing, nombre de lignes limité progressivement.
- Clés vides en première colonne retenues pour éviter une suppression silencieuse.
- Détection élargie des préfixes de formules et encodage de sécurité explicite lors de l'export.
- PWA versionnée et purification des anciennes ressources mises en cache ; interface avec sélecteur de fichier accessible au clavier.

### Validation différenciée
La présence des tests n'est pas un résultat : vérifier pour le SHA final le workflow CSVClinic dédié, ses tests Node et ses tests Chromium et le workflow global issu du merge-base du dépôt.

### Limites
Un traitement CSV basé sur des clés potentiellement non uniques peut supprimer des enregistrements significatifs ; la protection des formules n'est pas une certification indépendante contre tous les tableurs. Les conversions sont locales et ne valident ni les types métiers ni les jeux de données volumineux, les encodages historiques et tous les dialectes.

Les cinq références de bibliothèque identifiées ci-dessus restent des **fiches existantes réellement lues dans le dépôt** et non une relecture des PDF originaux. Le parseur et les corrections sont des adaptations propres au projet.
