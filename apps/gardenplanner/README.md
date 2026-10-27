# GardenPlanner

Plan du potager et calendrier des tâches, gratuit, sans compte et hors ligne.

- Parcelles en grille (1 à 20 × 1 à 20 cases carrées, côté de case saisi en cm) ; surface en m².
- Cultures placées sur un rectangle de cases (colonne, rangée, largeur, hauteur), avec famille botanique choisie par l'utilisateur.
- Semis (date), plantation facultative, début et fin de récolte : chaque étape **saisie** par une date ou par un délai en jours après le semis (stockée en délai).
- Occupation : la parcelle est occupée de la plantation (ou du semis direct) à la fin de récolte ; deux cultures ne peuvent pas occuper les mêmes cases en même temps, les successions restent possibles.
- Rotation : une culture de la même famille sur la même parcelle l'année précédente est signalée (en précisant si ce sont les mêmes cases) ; « autre ou inconnue » ne déclenche rien.
- Calendrier mensuel des tâches à cocher, retards signalés ; export .ics des tâches non faites de l'année affichée.
- Sauvegarde JSON validée avant restauration (chevauchements compris) ; mode protégé si le stockage local est illisible.

Limites : aucune donnée agronomique (délais, distances, associations) ; les dates de l'exemple sont des démonstrations.

Tests : `bash scripts/test_app.sh gardenplanner`.
