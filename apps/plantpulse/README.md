# PlantPulse

Suivi des soins des plantes, gratuit, sans compte et hors ligne.

- Pour chaque plante : arrosage, engrais et rempotage, chacun avec une fréquence en jours **saisie par l'utilisateur** (vide = soin non suivi) et la date du dernier soin connu.
- Prochaine échéance = dernier soin (le plus récent entre la fiche et l'historique) + intervalle ; retards en jours ; vue « Aujourd'hui » (retards d'abord) avec bouton « Fait ».
- Ajustement saisonnier facultatif : mois cochés + coefficient saisi (25 à 400 %), appliqué à l'arrosage et à l'engrais selon le mois du dernier soin, arrondi au jour le plus proche (au moins 1 jour). Le rempotage n'est jamais ajusté.
- Historique des soins (ajout d'un soin passé, suppression, filtre par plante), plafonné à 3 000 entrées (les plus anciennes sont oubliées).
- Export agenda .ics : une occurrence par échéance calculée sur 30, 90 ou 365 jours (saisons comprises), 3 000 événements au plus.
- Sauvegarde JSON validée champ par champ avant restauration ; mode protégé si le stockage local est illisible.

Limites : aucune base botanique ni conseil de culture ; les valeurs de l'exemple sont des démonstrations, pas des recommandations.

Tests : `bash scripts/test_app.sh plantpulse`.
