# KanbanPocket

Tableaux Kanban locaux, gratuits, sans compte et hors ligne.

- Plusieurs tableaux ; colonnes « À faire / En cours / Fait » renommables (jusqu'à 8), limite WIP par colonne : l'ajout ou le déplacement vers une colonne pleine est refusé, une limite abaissée sous le nombre de cartes est signalée.
- Cartes avec étiquettes (5 au plus), échéance et notes ; la dernière colonne compte comme « terminée » (jamais en retard).
- Déplacement par boutons, au clavier (Maj + flèches, inversées en arabe), à la souris ou au doigt (glisser par la poignée) ; l'ordre est conservé même quand des filtres masquent des cartes.
- Filtres : texte, étiquette, échéance (en retard, 7 jours, sans échéance) ; export CSV (en-têtes traduits, formules de tableur neutralisées) ; sauvegarde JSON validée ; protection si le stockage local est illisible.

Limites : un nom de colonne laissé vide suit la langue et la place de la colonne (première « À faire », deuxième « En cours », dernière « Fait ») ; un nom saisi reste tel quel.

Tests : `bash scripts/test_app.sh kanbanpocket`.
