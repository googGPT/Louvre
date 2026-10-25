# SnapAction — Web 1.0

**Une idée. Une action. C'est noté.** Application de tâches/rappels 100 % navigateur. **Aucune API payante, clé API, publicité, analytics, compte, backend, package de production ou dépendance externe.** Le code statique est hébergé par GitHub Pages et les tâches sont conservées sur votre appareil avec IndexedDB.

## Mode d'emploi

1. Écrivez « Envoyer le dossier demain à 14h30 », « appeler lundi 9h », « dans 2 heures », « 28/10 à 16h », ou une tâche sans date. Vérifiez et modifiez la date suggérée. Sans date reconnue, la tâche reste sans échéance.
2. Choisissez une priorité et, pour une tâche datée, une répétition facultative ; joignez éventuellement une capture/photo (JPEG/PNG/WebP ≤ 4 Mo). L'image est réduite par le navigateur, sans être envoyée sur Internet.
3. Enregistrez. La tâche est stockée dans IndexedDB **sur ce navigateur et cet appareil**. Vous pouvez marquer comme terminée, modifier, supprimer, reporter d'un jour, rechercher et filtrer les tâches.
4. Exportez régulièrement votre **sauvegarde JSON privée** ; l'import de cette sauvegarde remplace votre liste après confirmation et validation complète du contenu. L'export calendrier `.ics` permet de placer les échéances dans une vraie application de calendrier.
5. Après une première ouverture en ligne et installation des fichiers statiques, l'application peut se rouvrir hors ligne. La proposition « Installer » n'apparaît que si le navigateur la prend en charge.

## Rappels : limite cruciale

**SnapAction ne garantit pas les notifications lorsque la page et l'application sont fermées.** Les notifications Web sont facultatives, demandent une autorisation, ne sont contrôlées que pendant que l'application est visible et ne rattrapent pas indéfiniment les échéances anciennes. Les notifications peuvent également dépendre du navigateur et du système d'exploitation. Pour un rappel fiable indépendamment du navigateur, exportez les échéances vers votre calendrier habituel.

**Il n'y a ni OCR ni reconnaissance vocale automatique.** La capture d'écran est enregistrée comme pièce jointe consultable. La dictée du clavier du téléphone peut être utilisée si le système la propose, mais SnapAction ne transmet pas de voix à une API.

Les exemples de langage naturel sont des **règles déterministes** et non un modèle IA ; le texte peut être mal interprété (« lundi prochain », dates ambiguës). La date reste visible et modifiable avant confirmation. Les tâches récurrentes créent la prochaine échéance au moment de terminer la tâche (pas une liste infinie). Les horodatages sont sauvegardés en ISO UTC et présentés dans le fuseau du navigateur ; les délais relatifs de « N jours » sont en blocs de 24 h, donc des décalages peuvent survenir autour de l'heure d'été.

## Confidentialité et sauvegardes

- Toutes les données (y compris les photos compressées en Data URL) sont persistées **localement via IndexedDB**, sans requêtes réseau à une API. Le service worker ne précharge et ne met en cache que le code statique du dossier `apps/snapaction/`.
- Effacer les données du navigateur ou utiliser un autre appareil peut supprimer/masquer toutes les tâches. La persistance dépend du navigateur. **Exportez les sauvegardes régulièrement** et protégez leur contenu : elles peuvent inclure des informations et photos personnelles.
- Pas de synchronisation multi-appareils. Les importations inconnues/corrompues/avec identifiants en double sont refusées avant toute transaction d'écriture. Une importation valide remplace la liste existante avec confirmation.
- Capacité de référence pour une sauvegarde importable : maximum 2 000 tâches, 9 Mo par fichier JSON ; les exports plus grands peuvent demander des exportations futures segmentées. Les images sont redimensionnées à 1 000 px maximum et encodées en JPEG.

## Développement et vérifications

```sh
node --test apps/snapaction/tests/core.test.cjs
python -m pip install playwright
python apps/snapaction/tests/browser.test.py
```

Le test navigateur nécessite Chromium local ou Google Chrome préinstallé ; sous GitHub Actions, le navigateur Chrome préinstallé est utilisé, sans télécharger de service externe payant. Le test vérifie création avec date/capture, persistance après rechargement, modification, JSON export/import, calendrier ICS, tâches terminées, cache PWA et affichage mobile.

Fichiers : `core.js` (règles métier pures), `app.js` (UI/IndexedDB), `sw.js` (shell offline), `style.css` (interface), `index.html`/`index.htm` (entrées), `manifest.webmanifest`/`icon.svg` (installation Web).

## Documentation Louvre

Consulter [`LOUVRE-REVIEW.md`](LOUVRE-REVIEW.md) pour les cinq fiches techniques réellement consultées, les compromis et la stratégie de test. Aucun livre PDF n'est publié, aucun framework coûteux ou serveur supplémentaire n'est nécessaire.