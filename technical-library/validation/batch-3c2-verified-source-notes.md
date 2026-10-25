# Lot Louvre 3C2 — Analyse de provenance et validation

Dix fiches nouvelles (deux par ouvrage), extraites de dix chapitres jusqu’ici sans fiche spécifique.

## Réalisé dans l’environnement source ChatGPT

- Les cinq PDF ont été ouverts dans leur édition fournie et les empreintes SHA-256 calculées et comparées aux cartographies.
- Des pages ciblées ont été extraites des dix chapitres et leur terminologie vérifiée.
- Fiches rédigées comme synthèses originales ; exemples non extraits des livres.
- Le script `scripts/validate_library.py` a passé un test positif et un test négatif sur un mini dépôt de démonstration.

## Limites impératives

- Le validateur contrôle des métadonnées, liens et fichiers locaux, non la justesse des principes des livres.
- Le workflow GitHub n’a pas été exécuté en CI lors de la préparation du lot ; son résultat doit être observé dans GitHub.
- Les exemples Next.js, Vue.js, MongoDB, OAuth et GitHub Actions ne sont pas des implémentations prêtes pour production.
- Les versions modernes doivent être vérifiées dans la documentation officielle avant utilisation.
- La couverture totale de 70 chapitres reste partielle et la présence d’une fiche n’équivaut pas à l’étude complète du chapitre.