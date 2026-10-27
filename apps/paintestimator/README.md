# PaintEstimator

Estimateur de peinture, gratuit, sans compte et hors ligne.

- Surface de chaque pièce : périmètre × hauteur, moins les portes, fenêtres et autres surfaces non peintes saisies, plus le plafond éventuel.
- Litres nécessaires : surface × nombre de couches ÷ rendement (m²/L) lu sur le pot, arrondi au ml supérieur, puis marge saisie.
- Meilleure combinaison de pots parmi les contenances et prix saisis (programmation dynamique exacte) : coût minimal, puis moindre surplus, puis moins de pots ; comparaison avec l'achat d'une seule contenance.
- Calculs en entiers (cm, cm², ml, centimes) ; plusieurs projets ; export CSV et impression ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : le rendement réel dépend du support, de l'outil et de la teinte ; aucune valeur n'est fournie par défaut. Combinaison calculée jusqu'à 2 000 L.

Tests : `bash scripts/test_app.sh paintestimator`.
