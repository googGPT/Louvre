# NoiseDiary

Journal daté des nuisances sonores observées, gratuit, sans compte et hors ligne.

- Observation : jour civil, heures de début et de fin (une fin plus tôt que le début = fin le lendemain), type de bruit, intensité **perçue** de 1 à 5, source supposée, notes factuelles. Modification et suppression.
- Statistiques sur une période choisie : nombre, durée totale, minutes par heure de l'horloge, par jour de la semaine, par type et par source ; nuits concernées et minutes de nuit selon une plage réglable (22:00–07:00 par défaut ; une nuit porte la date du jour où elle commence).
- Exports : CSV (en-têtes traduits, séparateur `;`, cellules protégées contre les formules), rapport imprimable factuel, sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : aucune mesure en décibels (l'intensité est une perception) et aucun avis juridique ; les sources sont celles que l'utilisateur suppose.

Tests : `bash scripts/test_app.sh noisediary`.
