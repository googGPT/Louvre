# ChoreWheel v2 — planning domestique privé et gratuit

Une application Web autonome de gestion des tâches ménagères récurrentes : calcul des échéances, répartition pondérée par fréquence, suivi des réalisations, recherche, filtres, édition et import/export.

## Fonctions réellement mises en œuvre

- Créer et éditer une tâche, son responsable, sa pièce (facultatif), la date de dernière réalisation, sa fréquence entière en jours et sa durée prévue entière en minutes.
- Marquer « Fait » en un clic : décale la prochaine échéance et ajoute la date au suivi des réalisations (historique limité à 100 dates par tâche). Une répétition le même jour ne crée pas de doublon.
- Tableau de bord : en retard, à réaliser (en retard + aujourd'hui), effectuées aujourd'hui, à venir sous sept jours ; filtre par état et responsable.
- Répartition du volume de tâches par responsable selon **durée prévue × 7 / nombre de jours entre deux interventions**. C'est une projection, **pas** un temps réellement effectué ni une recommandation d'équité absolue.
- Export JSON complet compatible avec les sauvegardes du premier ChoreWheel, et restauration vérifiée avec confirmation ; exports CSV (Excel) et ICS (événements récurrents **à importer manuellement**).
- Trois exemples optionnels, après confirmation, sans effacer les tâches existantes.
- PWA utilisable hors ligne après un premier chargement réussi sur HTTPS. **Aucun compte, aucune API payante, aucun tracker**.

## Compatibilité et vie privée

La clé `localStorage` historique **`louvre-factory:chorewheel:v1`** et le format de sauvegarde **`app: chorewheel, version: 1, records`** restent inchangés. Les anciens enregistrements sans `room` et `history` sont valides ; ils reçoivent `room: ""` et `history: []`. Les dates de réalisation passées ne sont pas inventées. Une restauration invalide n'écrase pas le stockage en place.

Le navigateur peut effacer son stockage ; les exports JSON (avec noms de personnes et détails des tâches) sont privés. 500 tâches maximum, sauvegarde JSON inférieure à 900 000 caractères, historique maximum 100 dates par tâche. Aucune synchronisation multi-appareils ni notification automatique hors navigateur.

## Tests

Depuis la racine du dépôt Louvre :

```sh
node --check apps/chorewheel/core.js
node --check apps/chorewheel/app.js
node --test apps/chorewheel/tests/core.test.cjs
python apps/chorewheel/tests/browser.test.py
```

Le test Chrome couvre le cycle création → validation → réalisation → sauvegardes → restauration → hors ligne, sur un viewport mobile de 390 px. Le code utilise uniquement HTML, CSS, JavaScript, `localStorage`, le Service Worker et les fonctionnalités natives du navigateur.