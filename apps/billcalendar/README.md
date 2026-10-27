# BillCalendar

Factures et abonnements récurrents, gratuit, sans compte et hors ligne.

- Rythmes : chaque semaine, mois, trimestre ou année. Une échéance fixée un 29, 30 ou 31 tombe le dernier jour des mois plus courts (31 janvier → 28 février → 31 mars).
- Coût mensuel moyen (un abonnement annuel de 120 € compte 10 €/mois), total sur un an, total des 30 prochains jours, répartition par catégorie.
- Calendrier mensuel navigable, prochaines échéances, mise en pause d'un abonnement.
- Export agenda `.ics` (RFC 5545) : une série récurrente par facture active, à ouvrir dans le calendrier du téléphone.
- Sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : montants et dates saisis par l'utilisateur ; aucune banque n'est consultée.

Tests : `bash scripts/test_app.sh billcalendar`.
