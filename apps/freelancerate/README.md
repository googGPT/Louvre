# FreelanceRate

Calcul de tarif cible pour indépendants, gratuit, sans compte et hors ligne.

- Entrées saisies par l'utilisateur : revenu net visé par an, prélèvements sur le chiffre d'affaires (%), prélèvements sur le bénéfice (%), charges professionnelles (par mois ou par an), jours travaillés par semaine, semaines et jours non travaillés, part du temps facturée, heures facturées par jour.
- Modèle : net = (1 − t) × (CA × (1 − p) − charges) ; le chiffre d'affaires nécessaire est calculé exactement (entiers BigInt) puis arrondi au centime supérieur, de sorte que le net obtenu atteigne l'objectif.
- Résultats : tarif journalier et horaire (arrondis au centime supérieur), chiffre d'affaires annuel et mensuel, jours et heures facturés, décomposition du chiffre d'affaires jusqu'au net.
- « Tester un tarif » : net annuel obtenu avec un tarif journalier donné et écart avec l'objectif.
- Export CSV du calcul ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : aucun barème fiscal ou social n'est intégré (les taux de l'exemple sont fictifs et présentés comme tels) ; montants hors TVA ; tout le temps facturable est supposé vendu au même tarif ; les prélèvements réels peuvent avoir des seuils, minimums ou tranches que ce modèle linéaire ne représente pas.

Tests : `bash scripts/test_app.sh freelancerate`.
