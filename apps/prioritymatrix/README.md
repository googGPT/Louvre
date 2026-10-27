# PriorityMatrix

Matrice urgence × importance (Eisenhower), gratuite, sans compte et hors ligne.

- Deux critères explicites : l'importance (choisie) et l'urgence, soit calculée (« échéance dans N jours ou moins, ou dépassée », N saisi par l'utilisateur), soit fixée à la main. La raison de l'urgence est affichée sur chaque tâche.
- Quatre quadrants avec leur liste d'actions (faire, planifier, déléguer, abandonner), triées par échéance ; tâches faites à part.
- Classement en glissant la tâche (souris, ou doigt par la poignée), par la liste « quadrant » ou au clavier (Maj + flèches, inversées en arabe). Glisser vers un quadrant garde l'urgence automatique si elle concorde, sinon la fixe à la main.
- Exports : plan d'action Markdown, CSV (en-têtes traduits, formules neutralisées), sauvegarde JSON validée ; protection si le stockage local est illisible.

Limites : le seuil de 3 jours proposé à la création est une valeur de départ à ajuster ; la date du jour est celle de l'appareil.

Tests : `bash scripts/test_app.sh prioritymatrix`.
