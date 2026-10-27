# HypothesisGraph

Schéma de modèle de recherche, gratuit, sans compte et hors ligne.

- Variables typées : indépendante, dépendante, médiatrice, modératrice, contrôle (40 au plus par modèle).
- Hypothèses H1…Hn orientées, avec signe attendu (+, −, non précisé) ; une modératrice pointe vers une hypothèse.
- Validation stricte : pas d'auto-relation, pas de doublon de relation, d'étiquette ou de variable, pas de modération d'une modération.
- Détection des boucles causales (Tarjan, avec le circuit affiché), chemins de médiation (signe = produit des signes, médiation partielle ou totale) et diagnostics de rôle (indépendante qui reçoit une flèche, médiatrice incomplète…).
- Mise en page automatique déterministe en couches (causes à gauche, effets à droite, modératrices au-dessus, contrôles en dessous) ; les flèches qui traverseraient une boîte se courbent pour la contourner. Les boîtes se déplacent à la souris, au doigt ou au clavier.
- Exports : schéma SVG autonome, hypothèses rédigées en Markdown dans la langue affichée, sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : l'appli vérifie la cohérence du schéma, pas la validité théorique ou empirique des hypothèses.

Tests : `bash scripts/test_app.sh hypothesisgraph`.
