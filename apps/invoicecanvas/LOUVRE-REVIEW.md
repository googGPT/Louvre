# InvoiceCanvas — Louvre app 29, vague 2 (09/20) : audit et provenance

## Diagnostic du dépôt
Le registre main décrivait **InvoiceCanvas** comme une piste non développée (« devis et factures imprimables », « TVA, HT/TTC et numérotation »). Aucun répertoire `apps/invoicecanvas`, branche ou PR correspondante n'existait à l'ouverture du projet. L'intervention crée donc le produit initial ; ne pas raconter avoir corrigé un ancien code inexistant.

## Architecture et calculs propres au projet

`core.js` fournit un schéma validé de brouillon et copie verrouillée, un parseur décimal à échelle fixe, un moteur de calcul **centimes entiers**, le contrôle de dates calendaires, les plafonds (120 documents, 60 lignes), des suites numérotées par type/année et un stockage JSON versionné. Les calculs intermédiaires restent dans la plage entière sûre de JavaScript. Les arrondis **half-up par ligne** sont documentés : le regroupement TVA n'effectue **aucun deuxième arrondi**.

`app.js` fournit l'édition par formulaire, l'aperçu de la facture, l'impression par navigateur, les sauvegardes transactionnelles (le modèle en mémoire n'est remplacé qu'après succès de `setItem`), les exports JSON, la restauration validée, les copies brutes de secours, et la protection contre la modification/suppression d'un document verrouillé. Le rendu ne reconstruit pas du HTML à partir des valeurs utilisateur : `textContent` sur des noeuds DOM.

`index.html` / `index.htm` sont identiques, `style.css` traite l'affichage mobile et le rendu papier A4, `sw.js` ne cache que les actifs statiques et non les informations financières des utilisateurs.

**Limites :** cette numérotation n'est continue que dans l'historique local tel qu'il a été conservé ; elle n'est ni infalsifiable, ni garantie entre appareils ou comptes. Le verrouillage est **une contrainte d'interface**, non un archivage légal inaltérable. Les versions PDF enregistrées via le navigateur ne sont pas des factures électroniques structurées. L'application reste un **outil préparatoire**, pas une solution de facturation certifiée, et n'assure pas la conformité des obligations de TVA/e-invoicing.

## Source réglementaire vérifiée séparément (web, octobre 2026)

- Service Public Entreprendre — https://entreprendre.service-public.gouv.fr/vosdroits/F31808 : champs obligatoires et série de numéros continue.
- Service Public Entreprendre — https://entreprendre.service-public.gouv.fr/vosdroits/F23208 : explications de facturation papier/numérique et mentions.
- DGFiP — https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation : calendrier des obligations 2026/2027.
- DGFiP — https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais : recours à une plateforme agréée.

Ces sources officielles servent **uniquement à préciser les limites** de l'application. Les calculs, obligations particulières et arrondis ne sont pas présentés comme une certification juridique.

## Cinq fiches pertinentes de la bibliothèque Louvre, effectivement ouvertes

1. **TS16-001** — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials* (2026), chapitre 16, pages physiques PDF **396–400 rapportées par la fiche**. Principe : vérifier réellement toute entrée externe. Adaptation InvoiceCanvas : validation runtime des champs, décimaux, dates et imports JSON.
2. **FULL08-001** — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer* (2024), chapitre 8, pages **160–174 rapportées**. Principe : scénarios limites et contrôle indépendant des comportements. Adaptation : tests fiscaux arithmétiques et échec de quota de stockage.
3. **NEXT10-001** — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications* (2026), chapitre 10, pages **248–263 rapportées**. Principe : intégration via cas réels plutôt que simples simulations. Adaptation sans Next.js : test Playwright du bouton impression, des montants et d'exports réels.
4. **VUE02-001** — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3* (2024), chapitre 2, pages **40–47 rapportées**. Principe : état unique, vues dérivées et état conservé localement. Adaptation sans Vue : calcul dérivé d'un formulaire et stockage transactionnel versionné.
5. **GHA09-001** — `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions* (2023), chapitre 9, pages **210–220 rapportées**. Principe : CI à permissions minimales et traitement sûr des entrées. Adaptation : `contents: read` dans la QA dédiée, XSS traité comme texte et absence d'API facturable.

Les fiches présentes dans le dépôt ont été **lues** ; les PDF originaux n'ont pas été consultés au cours de cette intervention. Les pages reproduisent les références documentées, pas une preuve de nouvelle lecture. Le modèle monétaire et les cas tests sont des **créations originales**, non des extraits de livres.

## Assurance qualité et déploiement

`tests/core.test.cjs` vérifie les arrondis, limites, numérotation, séries et sérialisation. `tests/browser.test.py` lance Chromium réel, teste impression/print CSS, stockage, restauration, XSS, pannes de quota, mobile et hors ligne. La présence des fichiers n'établit pas leur succès ; consulter les journaux du dernier commit.

La PR dédiée doit rester ouverte en attente de validation explicite ; aucune modification directe de main ni merge automatique. Le workflow Pages contient déjà le slug `invoicecanvas`.
