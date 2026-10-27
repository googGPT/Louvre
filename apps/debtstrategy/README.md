# DebtStrategy

Comparateur d'ordres de remboursement de dettes, gratuit, sans compte et hors ligne.

- Dettes saisies : solde restant dû, taux annuel, paiement minimum mensuel ; budget mensuel total et mois du premier paiement.
- Deux stratégies avec le même budget : avalanche (taux le plus élevé d'abord) et boule de neige (plus petit solde d'abord) ; l'ordre est fixé au départ, le minimum d'une dette soldée repart vers la suivante.
- Échéancier mois par mois en centimes (intérêts, paiements, restant dû), intérêts totaux, date de fin, ordre de remboursement ; écart d'intérêts et de durée entre les deux.
- Budget insuffisant détecté : minimums non couverts, intérêts du premier mois non couverts, ou remboursement de plus de 50 ans.
- Export CSV de l'échéancier ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Hypothèses affichées dans l'appli : taux constants, intérêts mensuels = solde × taux annuel / 12 arrondis au centime, paiements en fin de mois, sans frais ni pénalités. Ce n'est pas un conseil financier.

Tests : `bash scripts/test_app.sh debtstrategy`.
