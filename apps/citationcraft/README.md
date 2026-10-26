# CitationCraft — application Louvre n° 28 (vague 2, 08/20)

**Diagnostic initial :** le registre Louvre décrivait CitationCraft comme une piste de gestion bibliographique **BibTeX/RIS**, sans application, branche ni PR existante. Cette intervention crée une **première version fonctionnelle**, et non une prétendue correction d'un projet absent.

## Fonctions

Application statique 100 % navigateur, sans authentification, API payante, métadonnées inventées ni bibliothèque chargée depuis un CDN.

- **CRUD** : ajouter, modifier, rechercher, filtrer par type et supprimer des références.
- **Schéma explicite** : clé bibliographique, type (article, book, inproceedings, misc), auteurs, titre, année facultative, revue/conférence, éditeur, volume, numéro, pages, DOI, URL et note.
- **Validation de cohérence** : titre et identifiant obligatoires ; clé limitée aux caractères sûrs ; dates numériques à quatre chiffres lorsqu'elles existent, URL HTTP(S) sans identifiants embarqués, DOI de forme `10.<préfixe>/<suffixe>` validée syntaxiquement. Cette validation n'atteste **pas l'existence du DOI ni de l'article**.
- **Anti-doublon** : interdiction des clés identiques sans tenir compte de la casse et des DOI identiques après normalisation insensible à la casse.
- **Stockage local transactionnel** : sauvegarde seulement après validation de toute la collection ; si `localStorage.setItem` échoue, l'interface conserve la version précédente. 200 références et 512 000 octets JSON maximum.
- **Restauration sûre** : verrouillage si le stockage est illisible, export d'une copie brute, restauration exclusivement après écriture réussie d'une sauvegarde JSON v1 valide, avec confirmation.
- **Exports** : BibTeX, RIS, JSON, après validation de la collection. **Imports** BibTeX, RIS, JSON en mode remplacer ou ajouter ; avertissement sur les champs ignorés avant confirmation et refus atomique des doublons.
- **PWA hors ligne** : la coquille statique est mise en cache, jamais les données des chercheurs. Les références persistent uniquement dans `localStorage` du navigateur.

## Compatibilité BibTeX volontairement délimitée

- Types acceptés : `@article`, `@book`, `@inproceedings`, `@misc`.
- Champs acceptés : `author`, `title`, `year`, `journal`, `booktitle`, `publisher`, `volume`, `number`, `pages`, `doi`, `url`, `note`.
- Accolades imbriquées équilibrées et guillemets pris en charge ; les champs inconnus sont **signalés** avant confirmation de l'import mais ne sont **pas conservés**. Les macros (`@string`, `month=jan`), concaténations `#`, `@preamble`, extensions `biblatex` ou transformations TeX ne sont pas interprétées ; si la syntaxe n'est pas gérée, l'import est refusé.
- Dans `author`, les noms sont séparés sur ` and `. Les constructions BibTeX avancées protégeant une mention littérale de « and » ou des particules de nom ne sont pas garanties.
- En export BibTeX, les accolades déséquilibrées sont refusées. Le champ `source` correspond à `journal` pour article et `booktitle` pour inproceedings ; pour book/misc, un champ `source` non vide provoque un refus explicite de l'export afin de ne pas le supprimer silencieusement.

## Compatibilité RIS volontairement délimitée

- Types RIS : `JOUR`, `BOOK`, `CONF`, `GEN`; champs `ID`, `AU`/`A1`, `TI`/`T1`, `PY`/`Y1`, `JO`/`JF`/`T2`, `PB`, `VL`, `IS`, `SP`, `EP`, `DO`, `UR`, `N1`.
- Les champs RIS inconnus (p. ex. `AB`, `SN`, `KW`) sont comptés et signalés avant import **puis écartés** si l'utilisateur confirme. Les extensions RIS d'un autre éditeur, les champs multilignes, les dates complexes, la distinction fine des conférences et les caractères TeX ne sont pas complètement gérés.
- Chaque entrée `TY` doit terminer par `ER`. Chaque auteur est conservé comme un champ distinct. L'export RIS **refuse un champ contenant un retour ligne**, pour éviter de produire une structure RIS invalide.
- **Pas de garantie de conversion sans perte** entre BibTeX et RIS. Conservez une sauvegarde JSON avant de transformer des références importantes et vérifiez le fichier dans votre gestionnaire bibliographique cible.

## Confidentialité et limites scientifiques

Toutes les données saisies sont stockées **sur l'appareil** dans `localStorage`. Elles ne sont envoyées vers aucun service bibliographique externe. Cependant le navigateur peut effacer le stockage local et toute personne ayant accès au profil navigateur peut consulter les références ; les exports téléchargés restent sur le disque. Sauvegardez régulièrement un fichier JSON.

L'affichage de références en prose est **informatif et simplifié**, **pas une mise en forme certifiée** APA 7, Chicago, Vancouver ou ISO 690. CitationCraft ne vérifie ni l'authenticité des auteurs, ni la date de publication, ni les métadonnées DOI, ni la correspondance à un article réel : l'utilisateur doit vérifier ces informations dans les publications originales. Les saisies HTML sont affichées avec `textContent`, jamais exécutées comme du code.

## Tests

```bash
node --check apps/citationcraft/core.js
node --check apps/citationcraft/app.js
node --check apps/citationcraft/sw.js
node --test apps/citationcraft/tests/core.test.cjs
python apps/citationcraft/tests/browser.test.py
```

Tests Node des contraintes de saisie, types, URL, DOI, doubles, versions JSON, BibTeX et RIS, entrée malformée, caractères Unicode et aller-retour contrôlé. Test Chromium de vrais exports BibTeX/RIS/JSON, CRUD, filtre, prévention des injections, mode ajout/remplacement, pertes signalées, restauration corrompue, quota, mobile 390px, fonctionnement hors ligne.

Ne conclure à la **réussite** qu'après consultation des GitHub Actions du **dernier commit**.

## Déploiement

Le workflow `.github/workflows/deploy-moneyuntil-pages.yml` reconnaît déjà le slug `citationcraft` pour la publication additive après fusion dans `main`. La branche PR ne modifie ni les applications anciennes ni `main`. Aucune fusion automatique n'est autorisée.

## Louvre et références

La fiche `LOUVRE-REVIEW.md` trace les références de la bibliothèque du dépôt : TS16-001, FULL08-001, NEXT10-001, VUE02-001 et GHA09-001. Ces références portent sur les principes de validation, tests, état de l'interface et sécurité CI. Le parseur BibTeX/RIS et la sérialisation sont des **adaptations originales**, sans attribuer aux auteurs des algorithmes bibliographiques qu'ils ne décrivent pas.
