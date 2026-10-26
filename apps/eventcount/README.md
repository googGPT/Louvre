# EventCount Web v2 — Invitations et budget

Application Web gratuite et locale pour suivre les RSVP de plusieurs événements sans mélanger les budgets.

## Fonctionnalités

- Invité ou groupe de personnes, statut **oui / peut-être / non**, taille du groupe et budget estimé par personne.
- Filtre par événement, agrégation des événements ayant une orthographe équivalente (casse, accents et espaces).
- Totaux en personnes, par groupe de réponse, et **fourchette budgétaire** : min. confirmés ; max. confirmés + éventuellement présents. Les refus sont exclus.
- Calcul des montants en **centimes** pour éviter les divergences dues aux nombres flottants.
- Détection de doublons d'invités par événement avant création ou édition, avertissement pour les anciens doublons déjà sauvegardés.
- Mise à jour directe des réponses depuis la liste, champ de recherche et modèle d'exemple sans remplacement des données.
- Export CSV de l'événement affiché ; export JSON complet et restauration JSON validée avant remplacement explicite.
- PWA installable selon navigateur et lecture hors ligne après première ouverture en ligne.

## Utilisation

Après fusion, ouvrir `https://googgpt.github.io/Louvre/apps/eventcount/` ou démarrer un serveur statique local dans le dossier. Au début, créer une invitation ou utiliser « Exemple guidé ».

Les fichiers de stockage proviennent du contrat historique `louvre-factory:eventcount:v1` et **restent compatibles** avec les exports EventCount v1 ; aucun migration ou nouveau champ obligatoire.

Tests :

```sh
node --check core.js && node --check app.js && node --check sw.js
node --test tests/core.test.cjs
python tests/browser.test.py
```

## Confidentialité et coûts

Aucun serveur, API, compte, suivi publicitaire ou abonnement. `localStorage` dans **le navigateur utilisé**, limité à 500 fiches et une sauvegarde inférieure à environ 900 Ko. Le nettoyage du stockage peut détruire les données : export JSON recommandé. Les exports peuvent contenir des noms de personnes ; ne les partagez pas publiquement.

Les budgets sont **des estimations**, non des dépenses réellement engagées, et leur somme repose uniquement sur les réponses manuellement saisies. L'application n'envoie ni invitations, ni emails, ni notifications automatiques.

## Traçabilité

Voir `LOUVRE-REVIEW.md` pour les cinq fiches des ouvrages Louvre et les choix d'implémentation. Aucun code ni extrait de livre protégé n'a été inclus dans le projet.