# RoomSketch — audit d'application 30 / vague 2 10/20

## Constat vérifié avant développement

Le registre `LOUVRE-WAVE2-TRACKER.md` établit **RoomSketch** comme « Plan de pièce à échelle », technique attendue « géométrie 2D, zones de collision », initialement marquée **« Piste évaluée ; non développée »**. La consultation de la liste d'applications, branches et PR GitHub n'a trouvé aucune implémentation antérieure. Cette mission réalise donc une **version initiale**, pas une révision de code supposé existant.

## Choix techniques originaux

- Un **noyau métier pur**, `core.js`, représente la pièce et les meubles en **centimètres entiers**. Les contraintes sont validées intégralement lors des imports et de chaque transaction. Définition de la collision entre rectangles axis-alignés : séparation ou contact des bords autorisés ; chevauchement strictement positif rejeté.
- Les rotations autorisées sont exclusivement **0°/90°**, correspondant à une permutation des dimensions occupées. La recherche d'emplacement libre s'effectue de manière déterministe sur une grille de 10 cm, sans déplacement arbitraire d'un meuble existant.
- `app.js` pilote un SVG vectoriel métrique rendu à partir d'un état unique. L'utilisateur peut déplacer les meubles au pointeur, au clavier ou via des champs numériques ; le dernier état géométriquement correct seulement est sauvegardé, avec vérification de l'écriture locale. Les données personnelles/labels ne sont pas interprétés en HTML.
- Exports **SVG** (XML échappé, proportions métriques préservées) et **JSON versionné** (restaurable après validation complète) et impression navigateur. Cache hors ligne statique uniquement.
- Limites explicites : pièce **200–1 500 cm**, taille de meuble **20–600 cm**, **60 éléments maximum**, sauvegarde **500 000 octets UTF-8** ; pas d'approximation silencieuse.

## Traçabilité des cinq fiches Louvre effectivement consultées

1. **TS16-001** — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, *Total TypeScript: The Essentials* (2026), chapitre 16, pages **396–400 rapportées dans la fiche**. Principe rapporté : assertions et validations de types honnêtes à l'exécution. Adaptation originale : schéma strict pièce/meuble, contrôles d'entiers, import JSON et tailles.
2. **FULL08-001** — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, *The Complete Developer* (2024), chapitre 8, pages **160–174 rapportées**. Principe : tests des cas limites et dépendances isolées. Adaptation : tests géométriques pour contact de bord, chevauchement, rotation et quotas de stockage.
3. **NEXT10-001** — `technical-library/concepts/testing/NEXT10-001-test-ui-and-api.md`, *Ultimate Next.js for Modern Web Applications* (2026), chapitre 10, pages **248–263 rapportées**. Principe : vérifier la réalité des parcours. Adaptation originale sans Next.js : Chromium vérifie la manipulation géométrique, les téléchargements SVG/JSON et le fonctionnement offline.
4. **VUE02-001** — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, *Building Real-World Web Applications with Vue.js 3* (2024), chapitre 2, pages **40–47 rapportées**. Principe : source unique de l'état et interface dérivée. Adaptation originale sans Vue : une instance du plan courant, vues recalculées et sauvegarde transactionnelle locale.
5. **GHA09-001** — `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md`, *Learning GitHub Actions* (2023), chapitre 9, pages **210–220 rapportées**. Principe : permission minimale pour les automatisations, ne pas interpréter les entrées externes. Adaptation : workflow `contents: read`, valeurs utilisateur rendues avec `textContent`, JSON validé et SVG échappé.

**Sources réellement ouvertes durant cette mission :** les cinq fiches de la bibliothèque du dépôt GitHub et l'index `technical-library/INDEX.md`. Les numéros de pages reprennent les informations **rapportées par ces fiches**, et ne représentent pas une nouvelle inspection des PDF originaux. Les algorithmes de collision et de dessin SVG sont des créations spécifiques à Louvre ; aucune attribution fictive aux auteurs.

## Vérification avant fusion

`node --check` sur `core.js`, `app.js` et `sw.js`, validité du manifeste PWA, égalité des entrées `index.html/index.htm`, tests Node métier, tests Chromium réels et contrôle documentaire Louvre. Les conclusions doivent s'appuyer sur les journaux GitHub Actions **du commit final** ; ne pas prétendre au succès simplement parce que les tests sont écrits.

## Risques et limites résiduels

- **Échelle relative correcte**, mais échelle physique d'impression non garantie : l'utilisateur doit mesurer et calibrer la sortie papier s'il veut du 1:50 ou 1:100. Les objets n'ont pas de dégagement, orientation libre, géométrie polygonale, hauteur ni épaisseur de murs.
- Une surface non occupée par des rectangles ne constitue pas une voie praticable ni une analyse d'évacuation ou d'accessibilité.
- Le magnétisme à 10 cm facilite le placement mais ne peut pas découvrir tout positionnement possible : un meuble peut tenir à une position hors grille alors que la recherche automatique échoue. Le déplacement manuel sans magnétisme reste possible.
- La validation géométrique ne vérifie aucune dimension réelle d'un meuble, murs ou bâtiments ; les presets sont des **dimensions illustratives**, non les mesures d'un fabricant.
- La sauvegarde `localStorage` reste modifiable et effaçable : absence d'historique immuable, de synchronisation entre appareils et d'archivage professionnel.
- Aucun résultat de QA ne certifie le comportement sur tous les navigateurs et mobiles, ou une conformité architecturale. Le fonctionnement hors ligne dépend de la première installation du service worker.

La PR de l'application 30 doit rester **non fusionnée** en attente d'autorisation explicite, sans modifier directement `main`.
