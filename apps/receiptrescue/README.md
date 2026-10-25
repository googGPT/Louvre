# ReceiptRescue — Web 1.0 (gratuit et local)

Application responsive pour garder ses justificatifs d'achat et suivre, **uniquement à partir des dates saisies par l'utilisateur**, les échéances de retour et de garantie. Ce n'est pas un avis juridique.

## Usage et vie privée

1. Ouvrir `index.html` via GitHub Pages à l'adresse `https://googgpt.github.io/Louvre/apps/receiptrescue/` après fusion et déploiement.
2. Ajouter un achat : article, magasin, prix, date ; facultativement dates de retour et de garantie, photo JPEG/PNG/WebP de 4 Mo maximum.
3. Consulter les alertes **lorsque la page est ouverte** : retour à 7 jours, garantie à 30 jours. Aucun message push/notification quand elle est fermée.
4. Dans **Mes sauvegardes**, exporter puis restaurer un JSON avec les photos. Garder le fichier exporté dans un endroit privé.

Les données sont conservées dans **IndexedDB du navigateur**, sans compte, cookie analytique, serveur, API ou paiement. Pas de reconnaissance OCR automatique. Effacer les données du navigateur ou utiliser un nouvel appareil **ne synchronise pas** les informations : exporter avant. Le navigateur peut supprimer le stockage local selon ses règles d'espace et de confidentialité. Chaque sauvegarde peut contenir des achats et photos sensibles : protéger les exports.

## Architecture sans coût récurrent additionnel

- `index.html` et `index.htm` : mêmes pages ; GitHub Pages utilise `index.html`.
- `style.css` : interface mobile-first, sans bibliothèque distante.
- `core.js` : validations et calculs purs, tests Node sans package installé.
- `app.js` : événements UI et couche IndexedDB, photo en Blob, sauvegarde JSON.
- `tests/receiptrescue.test.mjs` : validation, dates, calculs, imports malformés.
- `tests/browser.test.py` : parcours d'acceptation sur GitHub Actions avec Playwright/Chrome, **dépendance CI seulement** ; pas de coût d'API ni de dépendance pour les visiteurs.

## Limites connues

- Les dates contractuelles et garanties sont saisies, non déduites de règles juridiques.
- Une alerte dans l'interface ne remplace pas un rappel système : la page doit être ouverte.
- Les photos peuvent consommer l'espace de stockage de l'appareil ; maximum 4 Mo/photo, 300 fiches.
- Les sauvegardes JSON remplacent la collection existante après confirmation, pas de synchronisation multi-appareil.
- Aucune solution de récupération d'une donnée perdue si l'utilisateur n'a pas exporté le JSON.
- Une future application mobile pourra reprendre la logique métier `core.js`, mais ne sera développée qu'après validation de cette version Web.

## Tests

```sh
node --test apps/receiptrescue/tests/receiptrescue.test.mjs
# Vérification facultative dans un environnement de CI avec navigateur Chromium :
python apps/receiptrescue/tests/browser.test.py
```

## Traçabilité Louvre

Consulter [LOUVRE-REVIEW.md](LOUVRE-REVIEW.md) pour la sélection des fiches issues des cinq livres et les compromis. Les PDF privés **ne sont pas publiés**.

## Web 1.1
- Vue des dates à venir, export volontaire au calendrier (.ics) et ventilation des achats par mois.
- PWA avec shell hors ligne après première visite; les données et photos restent dans IndexedDB.
- Un avertissement explicite apparaît si le navigateur bloque le stockage local, avec bouton de réessai.
- Export JSON refusé plutôt que de générer silencieusement un fichier de plus de 32 Mo impossible à réimporter.
- **Aucun serveur/API/abonnement** ajouté.