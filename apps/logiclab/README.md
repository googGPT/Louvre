# LogicLab

Laboratoire de logique propositionnelle, gratuit, sans compte et hors ligne.

- Analyseur d'expressions : symboles (¬ ∧ ∨ ⊕ → ↔), écriture « programmation » (! & | ^ -> <->) et mots-clés anglais ou français (NOT/NON, AND/ET, OR/OU, XOR, IMPLIES, IFF/SSI) ; constantes 1 0 ⊤ ⊥ ; erreurs localisées (position du caractère fautif).
- Priorités : ¬ > ∧ > ⊕ > ∨ > → > ↔ ; l'implication est associative à droite.
- Table de vérité jusqu'à 10 variables (1 024 lignes), colonnes intermédiaires, filtre des lignes vraies, ordre 0→1 ou 1→0, export CSV et impression.
- Tautologie, contradiction ou satisfiable (nombre de lignes vraies) ; équivalence de deux expressions avec contre-exemples et relation d'implication.
- Formes normales disjonctive et conjonctive : canoniques (mintermes / maxtermes) et simplifiées (Quine-McCluskey : implicants premiers, essentiels puis choix glouton déterministe, signalé quand il intervient).
- Expressions enregistrées, brouillon enregistré automatiquement ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : logique propositionnelle classique uniquement (pas de quantificateurs) ; la forme simplifiée n'est pas garantie minimale quand un choix glouton a été nécessaire ; les mots-clés des expressions restent anglais ou français dans toutes les langues.

Tests : `bash scripts/test_app.sh logiclab`.
