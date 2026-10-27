# ParkingSpotMemory

Mémo de stationnement, gratuit, sans compte et hors ligne.

- Emplacement en cours : parking ou rue, niveau, zone ou allée (ou couleur), place, repères ; au moins un indice est exigé.
- Photo facultative réduite sur l'appareil (plus grand côté 640 px, JPEG ; 480 puis 360 px si trop lourde) et gardée localement ; seules les 5 photos les plus récentes de l'historique sont conservées (100 entrées au plus).
- Position GPS facultative, demandée uniquement sur action de l'utilisateur ; « Où est ma voiture ? » calcule la distance (haversine), le cap et le point cardinal depuis la position actuelle, avec la marge d'incertitude GPS. Aucune carte n'est chargée : un simple lien OpenStreetMap s'ouvre si on le touche.
- Minuterie de fin de stationnement (durée « 1h30 » ou heure de fin), prolongation +15 min / +1 h, alerte N minutes avant et à l'échéance (bannière, vibration et bip si le navigateur le permet, tant que la page est ouverte), rappel .ics avec alarme pour un rappel page fermée.
- Historique : durée de chaque stationnement, durée moyenne, parking le plus fréquent, « la dernière fois ici » (niveau, zone, place) pour reprendre ses habitudes.
- Sauvegarde JSON validée champ par champ ; mode protégé si le stockage est illisible.

Différence avec ParkWise : ParkWise compare des tarifs de stationnement saisis ; ParkingSpotMemory ne calcule aucun prix et sert à retrouver le véhicule (niveau, zone ou allée, couleur, photo locale, minuterie, historique).

Limites : l'alerte dans la page ne sonne pas page fermée (utiliser le .ics) ; le GPS est souvent imprécis en parking souterrain (d'où les repères) ; la direction est un cap à vol d'oiseau.

Tests : `bash scripts/test_app.sh parkingspotmemory`.
