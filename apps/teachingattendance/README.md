# TeachingAttendance

Feuille de présence locale pour enseignants, gratuite, sans compte et hors ligne.

- Liste d'étudiants saisie ou importée (CSV ou copier-coller : « Nom » ou « Nom;Numéro ») ; homonymes acceptés s'ils ont des numéros différents.
- Séances datées (jours civils), appel par séance : présent, retard, absent, excusé ; « tous présents » et effacement de l'appel.
- Taux d'assiduité par étudiant selon deux règles choisies par l'enseignant (retard compté présent, absence excusée neutre), sur les seules séances saisies ; seuil d'alerte saisi (dixième de %), comparé exactement en entiers.
- Export CSV des absences (une ligne par absence, retard ou excuse) et du bilan par étudiant, en-têtes traduits, cellules protégées contre les formules.
- Plusieurs classes ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : 500 étudiants et 300 séances par classe. Le seuil et les règles sont ceux de l'enseignant : l'appli ne reprend aucun règlement d'établissement.

Tests : `bash scripts/test_app.sh teachingattendance`.
