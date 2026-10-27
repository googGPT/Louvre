# CashEnvelope

Budget « en enveloppes », gratuit, sans compte et hors ligne.

- Revenu du mois à répartir (facultatif) : montant réparti, non réparti, alerte si l'on répartit plus que le revenu.
- Enveloppes avec budget mensuel ; option « report » : le reste (ou le dépassement) d'un mois s'ajoute au mois suivant.
- Dépenses datées par enveloppe ; solde, pourcentage utilisé, alerte au seuil choisi (ex. 80 %) et en cas de dépassement.
- Exports CSV (bilan du mois, dépenses du mois) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.
- Montants en centimes ; mois et jours civils ; 7 langues, devise au choix.

Limites : un budget d'enveloppe est le même pour tous les mois (le modifier change aussi les mois passés) ; une enveloppe s'ouvre au mois affiché lors de sa création ; aucune connexion bancaire.

Tests : `bash scripts/test_app.sh cashenvelope`.
