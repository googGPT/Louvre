# BankFeeLens

Comparateur du coût annuel d'offres bancaires selon votre usage, gratuit, sans compte et hors ligne.

- Usage saisi (moyennes par mois, une décimale acceptée) : retraits hors réseau, virements, opérations à l'étranger et leur montant moyen ; jours à découvert par an et découvert moyen.
- Tarifs saisis pour chaque offre (12 au plus) : tenue de compte par mois, carte par an, prix d'un retrait hors réseau et nombre de retraits gratuits par mois, prix d'un virement, taux annuel du découvert, frais fixes et commission en % à l'étranger.
- Coût annuel ligne par ligne (tenue de compte, carte, retraits, virements, intérêts de découvert = montant × taux × jours ÷ 365, étranger), classement du moins cher au plus cher et écart avec la meilleure offre.
- Calculs en centimes ; taux en points de base ; nombres d'opérations en dixièmes.
- Export CSV du classement détaillé ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

L'appli ne connaît aucune banque ni aucun tarif réel : tout est saisi par l'utilisateur ; ce n'est pas un conseil financier. Non pris en compte : frais d'incident, primes de bienvenue, assurances, plafonds et conditions particulières. Les tarifs de l'exemple sont de simples illustrations.

Tests : `bash scripts/test_app.sh bankfeelens`.
