# StudyRecall

Fiches de révision avec répétition espacée, gratuites, sans compte et hors ligne.

- **Méthode des boîtes de Leitner** : 5 boîtes, révisions espacées de 1, 2, 4, 8 puis 16 jours. « Je savais » fait monter la fiche d'une boîte ; « À revoir » la renvoie en boîte 1, à revoir le lendemain.
- File du jour : fiches en retard d'abord, puis boîtes basses ; filtre par paquet.
- Progression : fiches à réviser, révisées aujourd'hui, bien ancrées (boîte 5), taux de réussite, prévision sur 7 jours.
- Raccourcis : Espace = afficher la réponse, 1 = je savais, 2 = à revoir.
- Sauvegarde JSON validée avant restauration ; si le stockage local est illisible, rien n'est écrasé (copie brute exportable).

Limites : l'appli ne vérifie pas les réponses (auto-évaluation) ; les données restent dans ce navigateur.

Tests : `bash scripts/test_app.sh studyrecall`.
