# PeerFeedbackForm

Évaluation entre pairs pour travaux de groupe, gratuite, sans compte et hors ligne.

- Grille : critères (1 à 10), échelle entière choisie (minimum 0 à 10, maximum jusqu'à 100), barème de la note, auto-évaluation saisie mais exclue des calculs, ou comptée.
- Étudiants répartis en équipes ; saisie évaluateur → évalué, critère par critère, uniquement au sein de l'équipe ; avancement de chaque évaluateur.
- Agrégation par étudiant : nombre d'évaluations reçues, moyenne, écart-type d'échantillon (n − 1) des moyennes reçues, moyenne par critère, auto-évaluation et écart avec les pairs.
- Coefficient WebPA : chaque évaluateur complet distribue 1 point (total donné à j ÷ total donné) ; coefficient = somme des parts × (taille de l'équipe ÷ évaluateurs retenus). Évaluateurs incomplets ou n'ayant donné que des zéros écartés. Note individuelle = note d'équipe × coefficient exact, plafonnée au barème. La méthode est expliquée dans l'interface.
- Export CSV (en-têtes traduits, cellules protégées contre les formules) ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage local est illisible.

Limites : 300 étudiants, 30 par équipe, 10 critères. Les résultats sont des aides à la décision ; la note finale reste celle de l'enseignant. Pas de questionnaire à distribuer : la saisie se fait sur cet appareil (par l'enseignant ou en faisant passer l'appareil).

Tests : `bash scripts/test_app.sh peerfeedbackform`.
