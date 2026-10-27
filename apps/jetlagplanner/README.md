# JetLagPlanner

Visualiseur d'horaires de sommeil décalés entre deux fuseaux, gratuit, sans compte et hors ligne. **Pas un conseil médical.**

- Fuseaux IANA (`Europe/Paris`, `Asia/Tokyo`…) lus par `Intl` : décalage réel au jour du départ, heure d'été comprise.
- Horaires habituels de coucher et de lever saisis ; décalage par jour (0 à 180 min), sens (le plus court, avancer, retarder) et nombre de jours avant le départ et après l'arrivée choisis par l'utilisateur.
- Programme jour par jour affiché à l'heure d'origine et à l'heure de destination : avant le départ, l'horaire suit l'heure murale d'origine ; après l'arrivée, celle de la destination (chaque fuseau avec ses propres changements d'heure).
- Double horloge, graphique (export SVG), agenda `.ics` (une nuit par jour, en UTC).
- Plusieurs plans ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : simple calcul d'horaires à partir des réglages saisis. Aucune recommandation sur la lumière, la mélatonine, les médicaments ou le rythme à suivre.

Tests : `bash scripts/test_app.sh jetlagplanner`.
