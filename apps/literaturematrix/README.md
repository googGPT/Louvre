# LiteratureMatrix

Matrice de revue de littérature, gratuite, sans compte et hors ligne.

- Une ligne par article (auteurs, année, titre, revue, DOI facultatif), une colonne par élément d'analyse : question, méthode, données, résultats, limites, plus jusqu'à 12 colonnes personnalisées.
- Recherche sans accents, filtre par années, filtre des cellules vides (toutes colonnes ou une colonne), tri par colonne (les cellules vides restent en bas).
- Repérage des cellules vides : nombre par colonne et taux de complétude.
- Signalement des doublons probables (même DOI, ou mêmes auteurs, année et titre).
- Exports CSV (virgule ou point-virgule, en-têtes traduits, débuts de formule neutralisés) et Markdown, sur les articles affichés ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : aucune base bibliographique n'est consultée ; l'exemple contient des articles fictifs, signalés comme tels.

Tests : `bash scripts/test_app.sh literaturematrix`.
