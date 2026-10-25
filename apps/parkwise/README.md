# ParkWise Web 1.0

Comparez **vos propres tarifs de stationnement** gratuitement, sans API ni compte : durée, franchise, tarif horaire, frais d'entrée, plafond de 24 h, marche aller et valeur personnelle du temps. Enregistrez vos places habituelles, mémorisez volontairement la position GPS de votre voiture et exportez une sauvegarde JSON / un événement de calendrier ICS.

## Utilisation

Ouvrez `index.html` via GitHub Pages ou un serveur statique local. Pour activer PWA hors ligne, ouvrir en HTTPS ou sur localhost, une première fois avec Internet. Les données de vos tarifs et votre position sont conservées exclusivement dans `localStorage` de ce navigateur. Pas de synchronisation multi-appareils.

## Limites

L'application **ne recherche pas automatiquement des parkings réels** et ne vérifie ni disponibilité en temps réel, ni tarifs, ni restrictions de circulation. Les prix estimés suivent une grille tarifaire simple et ne sont pas une garantie. La position GPS peut être imprécise en parking souterrain. Le lien OpenStreetMap envoie les coordonnées au fournisseur de carte seulement lors du clic ; aucun appel cartographique au chargement. Une sortie `ICS` est un fichier à importer dans un agenda compatible, pas une notification Web en arrière-plan.

## Aucune facturation

HTML/CSS/JavaScript/Service Worker, aucun build, aucune API payante, pas de backend. Hébergement GitHub Pages existant sous réserve des quotas du fournisseur. Voir [LOUVRE-REVIEW.md](LOUVRE-REVIEW.md) pour les cinq fiches bibliographiques consultées et le contrôle GitHub Actions.