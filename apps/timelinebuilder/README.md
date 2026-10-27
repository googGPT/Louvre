# TimelineBuilder

Frises chronologiques à l'échelle, gratuites, sans compte et hors ligne.

- Événements datés à l'année, au mois ou au jour ; périodes avec début et fin (précisions mélangées acceptées) ; dates avant notre ère (de 9999 av. J.-C. à 9999, sans année 0).
- Calendrier grégorien proleptique ; années stockées en numérotation astronomique (1 av. J.-C. = 0), affichées en numérotation historique ; une date imprécise couvre toute son année ou tout son mois (un point est placé au milieu).
- Pistes (8 au plus) ; échelle linéaire ; graduations « rondes » en jours, mois ou années (alignées sur les années historiques) ; libellés empilés sans chevauchement.
- La frise affichée est le SVG exporté (textes échappés) ; export CSV avec dates ISO 8601 et dates lisibles ; sauvegarde JSON validée ; protection si le stockage local est illisible.

Limites : pas de conversion julienne (une date « julienne » doit être convertie par l'utilisateur) ; la frise SVG garde un fond blanc ; l'axe du temps va de gauche à droite dans toutes les langues.

Tests : `bash scripts/test_app.sh timelinebuilder`.
