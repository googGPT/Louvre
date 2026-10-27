# ResearchQuestionLab

Structuration guidée d'un projet de recherche, gratuite, sans compte et hors ligne.

- Sept étapes : problème, lacune (avec son type), objectif et questions (typées), variables (rôle, mesure, source), hypothèses (question, variable explicative, variable expliquée, sens attendu), cadre (population, unité d'analyse, période, données, méthode), liste de contrôle.
- Liste de contrôle calculée (20 points) : formes interrogatives, variables dépendante et explicative, mesurabilité, sources, hypothèses pour les questions comparatives, relationnelles ou causales, liens hypothèse-variables, variables inutilisées, période, plus trois points confirmés par l'utilisateur (accès aux données, éthique, faisabilité).
- Références vérifiées : une hypothèse pointe vers une question et des variables existantes ; supprimer une question supprime ses hypothèses, supprimer une variable défait les liens.
- Export Markdown dans la langue affichée ; plusieurs projets ; sauvegarde JSON validée ; mode protégé si le stockage local est illisible.

Choix assumés : aucune génération automatique de texte ; la liste de contrôle vérifie la structure, pas la qualité scientifique ; la période est saisie en années.

Tests : `bash scripts/test_app.sh researchquestionlab`.
