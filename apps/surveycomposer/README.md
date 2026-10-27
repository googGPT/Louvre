# SurveyComposer

Conception de questionnaires de recherche, gratuite, sans compte et hors ligne.

- Sections et questions : choix unique, choix multiple, échelle de Likert (2 à 11 points, premier code 0 ou 1, libellés d'ancrage, item inversé), texte court ou long, nombre (bornes, décimales, unité) ; codes de variables uniques (compatibles SPSS, R, Stata).
- Conditions d'affichage simples (égal, différent, au moins, au plus, inclut, n'inclut pas, a une réponse) portant uniquement sur une question placée plus haut : aucune boucle possible ; une question masquée masque celles qui en dépendent.
- Aperçu interactif : conditions appliquées en direct, contrôle des réponses obligatoires et des bornes ; réponses gardées en mémoire, jamais enregistrées ni envoyées.
- Contrôle de qualité (heuristique) : questions en double, questions doubles (mot de coordination selon la langue du questionnaire, plusieurs « ? »), échelles de Likert différentes ou libellés différents dans une même section, ancrages manquants, items inversés à recoder, conditions sur une question facultative.
- Exports : dictionnaire des codes en CSV (séparateur au choix), version texte imprimable (.txt ou impression), sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : aucun hébergement ni collecte de réponses ; le repérage des questions doubles repose sur des mots de coordination et produit des faux positifs comme des oublis (en arabe, la conjonction « و » attachée au mot n'est pas repérée).

Tests : `bash scripts/test_app.sh surveycomposer`.
