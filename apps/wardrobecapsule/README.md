# WardrobeCapsule

Garde-robe capsule, gratuite, sans compte et hors ligne.

- Pièces : nom, catégorie (haut, bas, pièce unique, chaussures, veste et manteau, accessoire), couleur (16 couleurs nommées), saisons, occasions.
- Compteur exact de tenues : haut × bas × chaussures, plus pièce unique × chaussures. Règles explicites et affichées : les couleurs neutres (noir, blanc, gris, marine, beige, marron, denim) vont avec tout ; au plus N couleurs non neutres distinctes par tenue (N choisi, 0 à 3) ; toutes les pièces partagent la saison et l'occasion filtrées (ou au moins une en commun).
- Règles de capsule : objectif par catégorie, palette autorisée. Bilan : objectifs atteints ou non, pièces hors palette, pièces qui n'entrent dans aucune tenue, et gain en tenues d'une pièce neutre supplémentaire par catégorie (calcul exact).
- Suggestions déterministes (choix glouton couvrant le plus de pièces différentes) et tenue du jour (rang = jour civil modulo le nombre de tenues).
- Export CSV des tenues (5 000 au plus) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible ; 200 pièces au plus.

Limites : les accords de couleurs sont des règles simples choisies par l'appli et l'utilisateur, pas un conseil de style ; vestes, manteaux et accessoires ne sont pas comptés dans les tenues.

Tests : `bash scripts/test_app.sh wardrobecapsule`.
