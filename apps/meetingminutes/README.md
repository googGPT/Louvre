# MeetingMinutes

Réunions minutées et comptes rendus, gratuit, sans compte et hors ligne.

- Ordre du jour minuté : horaires prévus de chaque point, chronomètre par point (ou temps saisi), dépassement par point, marge ou dépassement de l'ordre du jour, heure de fin projetée au rythme réel.
- Participants avec présence (présent, excusé, absent) ; notes, décisions et actions (responsable, échéance) rattachées au point en cours.
- Suivi : les actions encore ouvertes des réunions antérieures s'affichent (avec « en retard ») et se soldent depuis la réunion suivante ; « Préparer la suivante » reprend participants et points.
- Export du compte rendu en Markdown et des échéances ouvertes en .ics ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : durées et échéances sont celles saisies ; le chronomètre ne tourne que page ouverte (le temps est enregistré à l'arrêt, au changement de point ou à la fermeture).

Tests : `bash scripts/test_app.sh meetingminutes`.
