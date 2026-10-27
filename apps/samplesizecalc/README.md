# SampleSizeCalc

Calcul de taille d'échantillon, gratuit, sans compte et hors ligne.

- Une proportion : z calculé par l'inverse de la loi normale (algorithme AS 241 de Wichura, précision d'environ 1e-16), n₀ = z²·p(1−p)/e², effet de plan, correction pour population finie de Cochran n = n₁ / (1 + (n₁ − 1)/N), arrondi à l'entier supérieur, puis division par le taux de réponse attendu.
- Marge d'erreur obtenue pour un nombre de réponses donné (avec correction pour population finie) et intervalle de confiance correspondant.
- Deux proportions (groupes indépendants de même taille) : formule de Fleiss, test bilatéral ou unilatéral, correction de continuité facultative, total et personnes à contacter.
- Chaque étape est affichée avec sa formule et les valeurs utilisées ; avertissements (marge plus large que la proportion, effectifs attendus faibles, test unilatéral, contacts supérieurs à la population).
- Scénarios enregistrés, export CSV, sauvegarde JSON validée avant restauration, mode protégé si le stockage local est illisible.

Tests : valeurs de référence recalculées avec SciPy 1.18 (`scipy.stats.norm.ppf`) et valeurs classiques (385 ; 97 et 388 par groupe). `bash scripts/test_app.sh samplesizecalc`.

Limites : calculs sur hypothèses fondés sur l'approximation normale ; pas de plans complexes (stratification, grappes au-delà d'un effet de plan global), ni de méthodes exactes.
