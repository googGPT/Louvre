# TimeBlocks

Agenda quotidien en blocs de travail, gratuit, sans compte et hors ligne.

- Journée en minutes entières (00:00 à 24:00) d'un jour civil « AAAA-MM-JJ » ; blocs avec début, fin et catégorie (travail concentré, réunion, administratif, formation, personnel, pause).
- Détection des chevauchements (deux blocs qui se touchent ne se chevauchent pas), affichage côte à côte, minutes communes.
- Bilan : total par catégorie, temps occupé hors pauses (minutes en double comptées une fois), pauses, temps libre et créneaux libres dans la plage de travail réglable, temps hors plage, plus longue suite sans pause.
- Déplacement et redimensionnement au pas de 5 ou 15 minutes, à la souris, au doigt ou au clavier (↑/↓, Maj, Alt).
- Modèles de journée (remplacer ou ajouter) ; exemple généré dans la langue affichée.
- Export `.ics` (RFC 5545) d'un jour ou de tous les jours planifiés, en heures locales flottantes (sans fuseau) ; impression de la journée et de son bilan.
- Sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : un bloc ne dépasse pas minuit ; les durées ignorent les changements d'heure (jours de 24 h) ; pas de récurrence. Au doigt, on fait défiler l'agenda par la colonne des heures (les blocs se déplacent au glisser).

Tests : `bash scripts/test_app.sh timeblocks`.
