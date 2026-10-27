# VolunteerRoster

Planning des bénévoles d'un événement, gratuit, sans compte et hors ligne.

- Bénévoles : disponibilités (jour, de, à ; fenêtres fusionnées), compétences, maximum d'heures.
- Postes × créneaux : jour, horaire, nombre de personnes nécessaires, compétence requise facultative (comparée sans tenir compte de la casse).
- Affectation automatique déterministe (gloutonne) : affectations verrouillées conservées ; créneaux les plus difficiles d'abord (candidats possibles ÷ besoin), puis date et heure ; pour chaque place, le candidat le moins chargé, puis le moins polyvalent, puis par nom et identifiant. Toujours : disponibilité sur tout le créneau, compétence, aucun chevauchement, maximum d'heures. Ce n'est pas un optimum garanti, mais une proposition reproductible.
- Ajustement manuel : ajout (affectation verrouillée), retrait, verrouillage ; les bénévoles non éligibles sont listés avec la raison. Une modification de bénévole ou de créneau retire les affectations devenues impossibles et le dit.
- Trous de couverture signalés avec leur cause (personne d'éligible, ou pas assez de bénévoles libres) ; planning par personne imprimable ; export CSV (une ligne par créneau, en-têtes traduits, cellules protégées contre les formules).
- Sauvegarde JSON validée avant restauration (y compris la cohérence de chaque affectation) ; mode protégé si le stockage local est illisible.

Limites : 300 bénévoles, 500 créneaux ; un créneau ne passe pas minuit (fin au plus à 23:59).

Tests : `bash scripts/test_app.sh volunteerroster`.
