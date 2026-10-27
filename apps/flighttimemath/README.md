# FlightTimeMath

Calcul des vols avec escales, gratuit, sans compte et hors ligne.

- Départ et arrivée saisis en heure locale avec le fuseau IANA de chaque aéroport (`Europe/Paris`, `Asia/Tokyo`…) ; conversion en instants UTC par `Intl` (règles de fuseau du navigateur).
- Durées de vol et d'escale exactes, y compris lors d'un passage à l'heure d'été ou d'hiver ; une heure inexistante (trou du printemps) est refusée, une heure répétée (automne) prend la première occurrence et est signalée.
- Arrivée « J+1 » (date locale d'arrivée moins date locale de départ), décalage horaire ressenti, escale de nuit, changement d'aéroport.
- Correspondances plus courtes que le seuil saisi par l'utilisateur, ou impossibles (départ avant l'arrivée), signalées.
- Export agenda `.ics` (un événement par vol, horaires en UTC) ; plusieurs voyages ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : aucun horaire ni temps de correspondance de compagnie n'est préenregistré ; les règles de fuseau sont celles de la version d'ICU du navigateur.

Tests : `bash scripts/test_app.sh flighttimemath`.
