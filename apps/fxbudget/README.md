# FXBudget

Budget de voyage multidevise, gratuit, sans compte et hors ligne.

- Un voyage : dates, devise de référence (enregistrée avec le voyage, verrouillée dès qu'un taux ou une dépense en dépend), budget total et budgets par catégorie facultatifs.
- Taux de change **saisis** par l'utilisateur, datés, dans un sens ou dans l'autre (« 1 JPY = … EUR » ou « 1 EUR = … JPY »), 8 décimales au plus ; aucun taux n'est récupéré en ligne. Une dépense utilise le taux le plus récent daté au plus tard le jour de la dépense (à défaut, le plus ancien, signalé comme postérieur).
- Dépenses saisies dans leur devise, en unités mineures de cette devise (JPY sans décimale, TND à 3 décimales…), converties par un calcul rationnel exact (BigInt) puis arrondies au centime le plus proche, la moitié vers le haut, une fois par dépense.
- Synthèse : dépensé, reste, reste par catégorie, dépenses par jour (jours au-dessus du budget prévu signalés), reste disponible par jour sur les jours restants (arrondi au centime inférieur).
- Export CSV des dépenses (montant d'origine, taux appliqué et sa date, montant converti ; en-têtes traduits) ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage est illisible.

Limites : un seul voyage à la fois ; devise de référence parmi les 15 devises communes de Louvre ; ce sont des calculs sur hypothèses, pas un conseil financier.

Tests : `bash scripts/test_app.sh fxbudget`.
