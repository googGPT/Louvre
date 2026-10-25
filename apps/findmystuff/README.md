# FindMyStuff Web 1.0

FindMyStuff aide à retrouver ses objets chez soi : photo, pièce, rangement précis, quantité, étiquettes, recherche rapide et suivi des prêts avec date de retour facultative.

## Sans frais d'API

Site HTML/CSS/JS statique sur GitHub Pages. **Aucune API payante**, aucune librairie CDN, aucune connexion, aucun serveur. L'application conserve ses données dans IndexedDB et fonctionne hors ligne **après une première visite réussie** sur l'URL HTTPS. Usage mobile Web et PWA ; publication native dans les stores non comprise.

## Fonctions

- Ajout, modification, suppression d'objet et compression photo locale (JPG/PNG/WebP 5 Mo maximum en entrée).
- Recherche accent-insensible par nom, étiquette, pièce, tiroir/rangement, catégorie et notes. Filtres *chez moi*, *prêtés*, *en retard*, catégorie ; tris.
- Prêt à une personne, suivi date de prêt / retour prévu, marquage rendu.
- Sauvegarde JSON (avec photos) et restauration validée avant confirmation / remplacement, export CSV protégé contre injection simple de formules, impression de l'inventaire.
- PWA et sauvegarde locale. Sans notification push et sans scanner IA.

## Limites de données

Maximum 1 000 fiches, 10 étiquettes par objet, photo compressée de taille inférieure à environ 900 Ko en base64 ; sauvegarde maximum 15 Mio. Ne conservez pas des données sensibles sans comprendre les limites du navigateur et des copies de sauvegarde.

## Tests

Depuis la racine Louvre :

```bash
node --check apps/findmystuff/core.js
node --check apps/findmystuff/app.js
TZ=Europe/Paris node --test apps/findmystuff/tests/core.test.cjs
python apps/findmystuff/tests/browser.test.py
```

Consulter `LOUVRE-REVIEW.md` pour le lien entre cinq fiches de livres et les décisions réellement implémentées.