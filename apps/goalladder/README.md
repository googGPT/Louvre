# GoalLadder v2 — Objectifs et étapes

Application Web statique de planification personnelle, gratuite et sans API payante.
Un objectif contient des étapes autonomes, chacune avec un nom, une échéance, une priorité et un état terminé/non terminé.

## Utilisation

1. Remplissez **Objectif**, **Étape**, **Échéance**, **Terminée ?** et **Priorité**, puis enregistrez.
2. Consultez le taux d'avancement par objectif : les étapes ont toutes le même poids.
3. Marquez une étape comme terminée, réouvrez-la ou modifiez-la directement.
4. Filtrez par statut (toutes, à faire, sous 7 jours, en retard, terminées), recherchez un mot, triez par échéance, priorité ou ajout récent.
5. Exportez en JSON pour restaurer ultérieurement ; utilisez CSV uniquement pour exploiter les données dans un tableur.

## Définitions précises des indicateurs

- **Objectifs** : nombre de noms distincts (après suppression des espaces au début/fin de la saisie).
- **Étapes terminées** : étapes avec `done = oui`, indépendamment de leur échéance.
- **À faire sous 7 jours** : étapes non terminées dont l'échéance est entre **aujourd'hui et aujourd'hui + 7 jours**, bornes incluses.
- **En retard** : étapes non terminées dont la date est antérieure à aujourd'hui.
- **Avancement** : étapes terminées / total d'étapes par objectif × 100, arrondi à l'entier.
- Les échéances sont comparées comme **dates civiles**, sans heures ni fuseau horaire ; aucune notification automatique.

## Données et sauvegardes

- Données privées conservées dans `localStorage` sous **`louvre-factory:goalladder:v1`**. La v2 conserve **intégralement le contrat JSON version 1**, avec champs `id`, `goal`, `milestone`, `due`, `done`, `priority`.
- Maximum **500 étapes** ; taille de la sauvegarde contrôlée à **900 000 caractères JSON**, avec limite sur le fichier importé.
- En cas de stockage local corrompu, l'application bloque les écritures pour éviter l'écrasement des données ; elle autorise l'export brut et la restauration JSON validée.
- Export CSV en UTF-8 avec BOM, point-virgule, chaînes protégées contre l'interprétation de formules. **Le CSV ne permet pas de restaurer** l'historique. Ne publiez pas vos exports.

## Architecture et vérification

- `core.js` : validation, calcul métier, regroupement `Map`, recherche/tri, export.
- `app.js` : affichage DOM sans insertion HTML de données utilisateur, stockage local, actions et fichiers.
- `sw.js` : cache `shell-v2`, mise à jour du mode hors ligne après première installation.
- Tests métier : `node --test apps/goalladder/tests/core.test.cjs` ; tests intégration : `python apps/goalladder/tests/browser.test.py` (Playwright et Chromium disponibles dans le CI).
- Les résultats des tests sont à confirmer dans le **workflow GitHub Actions** du dernier commit ; ils ne découlent pas de leur seule existence.

## Limites

Pas de synchronisation, collaboration, calendrier distant ni notifications. Les données sont propres au navigateur et peuvent être effacées. Sans chiffrement des fiches dans le profil local ni certification quelconque. Les jalons sont pondérés également, sans dépendance entre tâches.