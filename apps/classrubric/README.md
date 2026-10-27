# ClassRubric

Grilles de notation critériées pour enseignants, gratuites, sans compte et hors ligne.

- Grille = critères pondérés (poids entiers 1–100), chacun avec 2 à 6 niveaux (nom, points entiers, descripteur).
- Évaluation d'une copie en cliquant le niveau atteint par critère ; une copie incomplète n'a pas de note.
- Note = barème × Σ (poids × points ÷ points max du critère) ÷ Σ poids, calculée en fractions exactes puis arrondie une seule fois (au point, demi-point, quart, dixième ou centième ; une moitié exacte monte).
- Statistiques de classe (moyenne, médiane, min–max, réussite moyenne par critère), export CSV (en-têtes traduits, cellules protégées contre les formules), impression de la grille vierge ou d'une copie notée.
- Plusieurs grilles ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : 50 grilles, 20 critères par grille, 2 000 copies. Les pondérations et points sont ceux de l'enseignant ; l'appli ne fait que les calculs.

Tests : `bash scripts/test_app.sh classrubric`.
