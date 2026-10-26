# RoundPlan Web v2 — entraînement fractionné

Application gratuite et autonome, sans API payante, serveur, compte ou connexion externe. Version Web PWA pour organiser des exercices à intervalles et les chronométrer sur téléphone ou ordinateur.

## Fonctionnalités

- Exercices ordonnés : durée d'effort (1–3 600 secondes), repos (0–1 800 secondes), rounds (1–100), nom personnalisable.
- Minuterie réelle avec démarrage, pause, reprise, passage à la phase suivante et remise à zéro ; affichage effort / récupération, exercice et round, progression globale.
- Horloge monotone `performance.now()` : compense le ralentissement des timers lors du passage en arrière-plan. L'affichage et l'audio peuvent cependant être retardés tant que l'onglet n'est pas actif.
- Signal sonore optionnel créé localement via Web Audio API lors des changements de phase, sous réserve d'autorisation du navigateur.
- Trois modèles *à copier dans le formulaire* : Tabata 20/10, HIIT 40/20 et Mobilité 45/15. Ils ne sont **pas** des prescriptions d'entraînement.
- Réorganisation des exercices, modification, suppression, recherche ; calcul distinct effort, repos, durée totale et nombre de rounds.
- Export CSV des phases, sauvegarde JSON v1, restauration vérifiée intégralement avant écriture avec confirmation ; mode hors ligne après premier chargement réussi en HTTPS.

## Règles du chronomètre

L'enchaînement est **Effort → Repos → Effort**, avec un repos uniquement entre deux rounds **du même exercice**. Pas de repos après le dernier round et pas de pause automatique entre deux exercices ; pour prolonger la récupération, utilisez un exercice léger ou modifiez les intervalles. Le bouton *Suivant* saute à la fin de la phase en cours. Toute modification du programme réinitialise la minuterie pour éviter de compter sur un ancien plan.

Le chronomètre utilise `performance.now()` et ne déclenche pas de notification garantie une fois le navigateur fermé. Les sessions en cours ne sont pas sauvegardées après rechargement. Ne pas compter sur l'app comme dispositif médical ou de sécurité.

## Sauvegardes et limites

La clé `localStorage` reste `louvre-factory:roundplan:v1`. Les sauvegardes version 1 restent acceptées, avec les mêmes quatre champs par exercice : `exercise`, `work`, `rest`, `rounds` (plus identifiant). L'application valide les champs numériques et les dates, bloque les phases fractionnaires ou négatives, les programmes supérieurs à 24 heures et les sauvegardes corrompues. Jusqu'à 500 exercices / 900 Ko. Effacer les données du navigateur efface le programme local ; exporter régulièrement le JSON.

## Tests

Depuis la racine du dépôt :

```
node --check apps/roundplan/core.js
node --check apps/roundplan/app.js
node --test apps/roundplan/tests/core.test.cjs
python apps/roundplan/tests/browser.test.py
```

Les tests navigateur nécessitent Chromium/Playwright et sont aussi exécutés par GitHub Actions. Les commandes et résultats réels doivent être vérifiés, et ne doivent pas être présumés.

## Bibliothèque Louvre

Voir `LOUVRE-REVIEW.md` pour les cinq ouvrages, références des fiches consultées et correspondance avec les décisions techniques. Pas de framework Next.js, Vue ou Quasar embarqué artificiellement.