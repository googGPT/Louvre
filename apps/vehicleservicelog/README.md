# VehicleServiceLog

Carnet d'entretien de véhicules, gratuit, sans compte et hors ligne.

- Plusieurs véhicules ; interventions datées avec kilométrage (km entiers), coût (centimes) et remarque ; relevés du compteur.
- Cohérence du compteur : un kilométrage ne peut pas être inférieur à un relevé antérieur ni supérieur à un relevé postérieur.
- Échéances d'entretien avec un intervalle **saisi** en km et/ou en mois, à partir de la dernière fois faite ; une intervention liée fait repartir l'échéance. Le premier seuil atteint compte (mois ancrés : 31 janvier + 1 mois = 28/29 février).
- Kilométrage estimé à la date du jour : dernier kilométrage connu + rythme observé entre le premier et le dernier point (au moins 7 jours d'écart) ; date estimée d'atteinte du seuil kilométrique.
- Rappels (en retard, aujourd'hui, bientôt selon vos seuils en jours et en km), coût total et coût d'entretien pour 100 km.
- Exports : agenda .ics (une journée par échéance avec alerte), CSV de l'historique (en-têtes traduits), sauvegarde JSON validée champ par champ ; mode protégé si le stockage est illisible.

Limites : aucun plan d'entretien constructeur n'est fourni ; l'estimation suppose un rythme constant ; distances en kilomètres uniquement ; les valeurs de l'exemple sont fictives.

Tests : `bash scripts/test_app.sh vehicleservicelog`.
