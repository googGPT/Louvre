# GroupAllocator

Constitution de groupes d'étudiants sous contraintes, gratuite, sans compte et hors ligne.

- Liste d'étudiants saisie, collée ou importée en CSV (« Nom » ou « Nom;Attribut », séparateur deviné, guillemets acceptés, en-tête facultatif) ; noms en double refusés.
- Groupes par taille cible (aucun groupe au-dessus) ou par nombre de groupes (tailles à un près).
- Règles « séparer » et « réunir » entre deux étudiants ; équilibre facultatif d'un attribut nommé (parcours, niveau…).
- Algorithme déterministe : blocs « réunir » (union-find), ordre mélangé par une graine saisie (FNV-1a + mulberry32), placement glouton, puis échanges de blocs qui ne font jamais augmenter le coût (violations d'abord, déséquilibre ensuite). Même liste, mêmes règles, même graine : mêmes groupes.
- Rapport des règles non satisfiables : « séparer » contredit par des « réunir », bloc trop grand pour un groupe, séparation impossible, groupe en débordement, plus de groupes que d'étudiants ; répartition de chaque valeur de l'attribut.
- Export CSV (en-têtes traduits, cellules protégées contre les formules), sauvegarde JSON validée avant restauration, mode protégé si le stockage local est illisible.

Limites : 500 étudiants et 500 règles par classe ; heuristique (bonne répartition, pas forcément optimale). Les attributs sont ceux que l'enseignant saisit ; aucun n'est déduit.

Tests : `bash scripts/test_app.sh groupallocator`.
