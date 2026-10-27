# PollBox

Vote anonyme sur un même appareil, gratuit, sans compte et hors ligne.

- Scrutin : question, 2 à 20 options, choix unique ou multiple (nombre de choix au plus), vote blanc facultatif, nombre de votants attendu facultatif.
- Isoloir : le reste de la page est masqué ; après chaque vote, l'écran « Au suivant » a déjà effacé le choix ; sortie de l'isoloir protégée par le code organisateur s'il existe.
- Seuls des totaux sont enregistrés (aucun bulletin individuel, aucune heure, aucun ordre) ; les résultats ne sont calculés qu'après une clôture définitive.
- Résultats : voix, pourcentages en dixièmes (plus fort reste pour un total de 100,0 % en choix unique ; part des votants en choix multiple), rang, égalités, blancs ; export CSV (en-têtes traduits, cellules protégées contre les formules) et impression.
- Plusieurs scrutins ; brouillon enregistré automatiquement ; sauvegarde JSON validée (totaux cohérents) avant restauration ; protection si le stockage local est illisible.

Limites (affichées dans l'appli) : la personne qui tient l'appareil peut voir un vote ; comparer le stockage avant et après un vote révèle ce vote ; rien n'empêche de voter deux fois ; le code organisateur est un verrou de confort (empreinte non cryptographique stockée localement), pas une sécurité. Ne remplace pas un vote officiel.

Tests : `bash scripts/test_app.sh pollbox`.
