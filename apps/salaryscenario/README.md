# SalaryScenario

Comparateur de revenus nets théoriques, gratuit, sans compte et hors ligne. **Aucun barème intégré.**

- Scénario : salaire brut mensuel (avec nombre de versements par an, de 1 à 24) ou annuel, primes brutes annuelles.
- Retenues saisies par l'utilisateur (10 au plus par scénario) : taux en % sur le brut, taux en % sur le net intermédiaire (brut − retenues sur le brut) ou montant fixe par mois.
- Résultats : brut annuel, détail de chaque retenue (par an et par mois), net annuel, net mensuel moyen (÷ 12), net d'un versement régulier, taux global de retenue ; comparaison de 8 scénarios au plus, classés par net annuel.
- Calculs en centimes ; taux en points de base ; retenues arrondies au centime ligne par ligne.
- Modifier ou dupliquer un scénario ; export CSV de la décomposition ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

L'appli ne connaît ni cotisations sociales, ni impôt, ni règle d'aucun pays : le résultat n'est qu'un calcul sur les taux saisis, pas un bulletin de paie ni un conseil. Choix assumés : les primes subissent les mêmes taux que le salaire ; les retenues « sur le net intermédiaire » s'appliquent toutes à la même base (pas en cascade). Les taux de l'exemple sont de simples illustrations.

Tests : `bash scripts/test_app.sh salaryscenario`.
