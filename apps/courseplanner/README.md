# CoursePlanner

Plan de cours et calendrier des séances pour enseignants, gratuit, sans compte et hors ligne.

- Séances avec titre, durée, objectifs et activités minutées ; contrôle « activités / durée de la séance ».
- Volume horaire : total des séances face au volume prévu (reste à placer ou dépassement).
- Calendrier : période (première et dernière date), jours de cours avec heure de début, vacances et jours fériés saisis (jour isolé ou intervalle). Les séances prennent dans l'ordre les jours de cours disponibles ; les séances sans date sont signalées.
- Export agenda `.ics` (heures « flottantes », lignes pliées à 75 octets), impression du plan, sauvegarde JSON validée avant restauration, mode protégé si le stockage local est illisible.
- Durées en minutes entières (saisie `1h30`, `1:30`, `45 min` ou `1,5`) ; dates en jours civils calculés en UTC.

Limites : une séance par jour de cours ; 30 cours, 200 séances par cours, 100 fermetures. Aucun calendrier scolaire n'est fourni : jours de cours et fermetures sont saisis par l'enseignant.

Tests : `bash scripts/test_app.sh courseplanner`.
