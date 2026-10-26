# CitationCraft — audit technique et traçabilité Louvre

## Identification et état initial vérifié

Application **28** de Louvre ; vague 2 **08/20**. L'application CitationCraft figure dans `LOUVRE-WAVE2-TRACKER.md` comme **piste évaluée, non développée** pour « gestion bibliographique BibTeX/RIS », avec comme technique attendue la sérialisation de références structurées. Au début de cette intervention, GitHub ne présentait ni répertoire `apps/citationcraft`, ni branche, ni Pull Request dédiée. Il s'agit d'une création, et non d'une correction de produit déjà livré.

## Architecture retenue

- `core.js` : format de données `{version:1, items:[...]}`, validation stricte des types/champs, auteur, année, DOI, URL, unicité clé/DOI, plafond taille, parseurs BibTeX et RIS, sérialiseurs, aperçu simplifié.
- `app.js` : état local transactionnel ; formulaires CRUD ; recherche ; import/export avec confirmation et avertissement ; stockage corrompu verrouillé jusqu'à restauration JSON v1 validée **et écrite avec succès** ; émission des téléchargements par Blob ; `textContent` pour toutes les valeurs bibliographiques saisies.
- `index.html` et `index.htm` identiques ; `style.css` responsive ; `sw.js` cache statique exclusivement, avec `manifest.webmanifest` et icône locale ; `tests/core.test.cjs` + `tests/browser.test.py` ; workflow CI avec droits minimaux.

Séparer les importations BibTeX/RIS (formats semi-structurés et dialectaux) du JSON de **sauvegarde canonique** évite de prétendre à une fidélité universelle. Une conversion n'est pas engagée après un défaut de structure, un DOI/identifiant dupliqué ou une validation échouée. Les champs inconnus importés sont **signalés avant consentement** et perdus en cas de confirmation ; aucune restitution fictive n'est revendiquée.

## Références documentaires Louvre : fiches consultées

1. **TS16-001** — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials* (2026), chapitre 16, pages physiques PDF **396–400** selon la fiche : les prédicats/assertions exigent une vérification réelle à l'exécution. **Adaptation originale** : validateur de schéma, clés, champs, types, URI, DOI, tailles et déduplication.
2. **FULL08-001** — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer* (2024), chapitre 8, pages physiques PDF **160–174** rapportées : scénarios positifs, cas limites et doubles. **Adaptation** : tests des séries de références et des erreurs de parsing, avec scénarios d'écriture du stockage refusée.
3. **NEXT10-001** — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications* (2026), chapitre 10, pages PDF **248–263** rapportées : tests isolés de composants et d'intégration. **Adaptation sans Next.js** : Playwright vérifie les téléchargements, importations asynchrones et la restauration locale.
4. **VUE02-001** — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3* (2024), chapitre 2, pages PDF **40–47** rapportées : source d'état et synchronisation de vues dérivées. **Adaptation sans Vue** : collection canonique en mémoire, écriture vérifiée d'abord, affichage conditionnel et événement `storage` multi-onglets.
5. **GHA09-001** — `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions* (2023), chapitre 9, pages PDF **210–220** rapportées : autorisations minimales et séparation des entrées externes. **Adaptation** : `permissions: contents: read`, jeux de test synthétiques, pas d'entrée utilisateur injectée dans un shell.

**Statut des sources :** seules les fiches de référence du dépôt ont été ouvertes pendant cette intervention ; les pages PDF sont celles **rapportées par les fiches**. Il n'est pas affirmé que les PDF originaux ont été relus ici ni que les algorithmes BibTeX/RIS sont directement fournis par ces ouvrages. Ils sont originaux et couverts par les tests dédiés.

## Limites et risques résiduels

- Les dialectes BibTeX/BibLaTeX et RIS sont vastes : quatre types documentaires sont acceptés et seuls les champs énumérés dans le README sont préservés. Les champs inconnus sont affichés en avertissement et ne sont pas reconstituables après import. Les macros, concaténations, syntaxes RIS multiline et directives avancées sont explicitement non gérées.
- La clé BibTeX, la liste des auteurs, les constructions TeX et les césures linguistiques ne sont pas normalisées selon tous les standards ; certains manuscrits devront être corrigés dans Zotero ou autre logiciel.
- Le DOI est validé sur sa **structure**, pas résolu ; aucun appel Crossref ni vérification de publication/année/auteur n'est réalisé. L'aperçu n'est pas une bibliographie normalisée APA.
- L'export RIS refuse les valeurs contenant un retour ligne et l'export BibTeX refuse une source non représentable ou des accolades déséquilibrées, pour ne pas corrompre silencieusement un fichier.
- `localStorage` dépend du navigateur et ne constitue pas une base sécurisée ou synchronisée entre appareils ; export JSON régulier recommandé. Le quota est limité et les écritures peuvent échouer.
- Les pages PWA sont cachées, pas les données bibliographiques ; hors ligne seulement après premier chargement réussi.

## Vérification requise avant toute fusion

Syntaxe JS des scripts, manifeste JSON, HTML miroir, tests de domaine Node, tests Chromium réels et validation du registre Louvre. Annoncer les résultats du **dernier SHA** uniquement lorsqu'ils sont obtenus. Les tests ne certifient ni exhaustivité du standard RIS/BibTeX, ni conformité APA. La PR doit rester non fusionnée sans instruction explicite.
