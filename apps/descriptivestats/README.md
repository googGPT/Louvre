# DescriptiveStats

Statistiques descriptives d'une série numérique, gratuites, sans compte et hors ligne.

- Saisie collée (une valeur par ligne, ou séparées par espace, tabulation, point-virgule) ou import CSV (choix de la colonne, en-tête détecté).
- Séparateur décimal choisi (virgule ou point) ; l'autre signe n'est admis que comme séparateur de milliers bien placé ; espaces insécables, apostrophe, chiffres arabes-indiens et virgule décimale arabe acceptés.
- n, somme, moyenne (somme compensée), médiane, écarts-types et variances (échantillon n − 1 et population n), erreur type, min, max, étendue, quartiles selon la méthode choisie (type 7, type 6 ou charnières de Tukey), écart interquartile, asymétrie G1 et aplatissement G2 (estimateurs ajustés, comme SKEW/KURT d'Excel).
- Valeurs manquantes (vide, NA, N/A, NaN, « . », « - »…) ignorées et comptées ; jetons illisibles listés avec leur ligne.
- Histogramme SVG (Sturges, Freedman–Diaconis ou nombre fixe de classes), téléchargeable ; export CSV des résultats ; séries enregistrées, sauvegarde JSON validée, mode protégé.

Tests : valeurs de référence calculées hors de l'appli (numpy 2.5, scipy 1.18) et cas analytiques exacts. `bash scripts/test_app.sh descriptivestats`.

Limites : statistiques descriptives seulement (aucun test ni intervalle de confiance) ; 100 000 valeurs au plus.
