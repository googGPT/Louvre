# PetCareLog

Carnet de soins des animaux de compagnie, gratuit, sans compte et hors ligne.

- Plusieurs animaux (nom, espèce, naissance facultatives) ; tout est rattaché à un animal.
- Soins récurrents (vaccin, vermifuge, antiparasitaire, toilettage, bilan, autre) : récurrence **saisie** en jours, semaines, mois ou années ; prochaine échéance ancrée sur le dernier soin (le 31 janvier + 1 mois = 28/29 février) ; retards ; bouton « Fait ».
- Rendez-vous (date, heure et lieu facultatifs), à venir et passés.
- Poids en grammes entiers (saisie en kg à 3 décimales ou en g) ; courbe SVG proportionnelle au temps ; dernier poids, évolution, min–max.
- Dépenses en centimes entiers par animal et par catégorie, filtrables par année ; affichées dans la devise choisie.
- Exports : agenda .ics (occurrences des soins et rendez-vous sur 90 jours ou 1 an), CSV des dépenses et des poids (en-têtes traduits, séparateur « ; »), sauvegarde JSON validée champ par champ ; mode protégé si le stockage est illisible.

Limites : aucun conseil vétérinaire ni calendrier vaccinal ; les montants ne portent pas de devise (la devise choisie s'applique à l'affichage) ; les valeurs de l'exemple sont des démonstrations.

Tests : `bash scripts/test_app.sh petcarelog`.
