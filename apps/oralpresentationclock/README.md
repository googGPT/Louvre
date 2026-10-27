# OralPresentationClock

Chronomètre de soutenances et de présentations orales, gratuit, sans compte et hors ligne.

- Ordre de passage (groupes ou candidats, membres facultatifs), réorganisable ; heure prévue de chaque passage à partir de l'heure de début, de la durée (présentation + questions) et du temps de changement.
- Deux phases chronométrées (présentation, puis questions), pause et reprise ; seuils d'alerte saisis en temps restant (« 2, 1, 0:30 »), alertes visuelles et signal sonore facultatif généré localement (Web Audio).
- Le temps est calculé à partir des horodatages (heure de départ, cumul des pauses), jamais en comptant les « ticks » : il reste juste si l'onglet passe en arrière-plan ou si la page est rechargée.
- Affichage plein écran lisible de loin (API Fullscreen, ou agrandissement CSS si elle est refusée) ; raccourcis clavier.
- Dépassements enregistrés par phase (secondes entières au-delà du temps prévu), bilan, export CSV du déroulé (en-têtes traduits, cellules protégées contre les formules).
- Sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : 200 passages, 5 seuils par phase, phases de 4 h au plus. L'heure réelle de début dépend de l'horloge de l'appareil ; un changement d'heure système pendant un passage fausse la mesure.

Tests : `bash scripts/test_app.sh oralpresentationclock`.
