# MarkdownDesk

Éditeur Markdown local, gratuit, sans compte et hors ligne.

- Analyseur maison (aucune bibliothèque) : titres, paragraphes, retours forcés, gras, italique, barré, code en ligne et blocs de code, citations imbriquées, listes à puces et numérotées (sous-listes), séparateurs, tableaux simples avec alignement, liens.
- Sécurité : l'analyseur produit un arbre de nœuds connus ; l'aperçu est construit avec `createElement`/`textContent` (jamais `innerHTML`) ; tout HTML saisi reste du texte ; les liens n'acceptent que `http(s)://` et `mailto:` ; les images ne sont pas chargées (texte alternatif affiché).
- Analyse en temps linéaire ou presque, même sur des textes piégés (délimiteurs sans fermeture, crochets en masse).
- Plusieurs documents enregistrés automatiquement ; ouverture d'un .md ; export .md et page .html autonome (CSP sans script, styles intégrés) ; impression de l'aperçu ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : sous-ensemble de Markdown (pas d'HTML brut, de notes de bas de page, d'images, de titres soulignés ni de listes de tâches).

Tests : `bash scripts/test_app.sh markdowndesk`.
