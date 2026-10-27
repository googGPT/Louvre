# TripDocumentList

Documents de voyage par voyageur, gratuit, sans compte et hors ligne.

- Pour chaque voyageur : passeport, carte d'identité, visa ou autorisation, assurance, réservations, billets, permis, document de santé, autre ; date d'échéance facultative, statut prêt / à faire, note libre.
- Contrôle de validité en jours civils : expiré, expire avant le départ, pendant le voyage, avant la fin de la marge saisie après le retour (en jours ou en mois, ajout de mois ancré sur le jour), ou valide (nombre de jours après le retour).
- Un document n'est « prêt » que s'il est coché et valide ; synthèse par voyageur et pour le voyage, prochaine échéance.
- Liste imprimable, export `.ics` des échéances (événements d'une journée) ; plusieurs voyages ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.
- Confidentialité : aucun numéro de document n'est stocké ; une note qui ressemble à un numéro (au moins 6 lettres/chiffres d'affilée dont 4 chiffres) est refusée.

Limites : aucune règle d'entrée, de visa ou de santé n'est intégrée ; la marge est saisie par l'utilisateur.

Tests : `bash scripts/test_app.sh tripdocumentlist`.
