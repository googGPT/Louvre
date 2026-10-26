# QuizCraft v2 — mini-quiz de révision

Application Web statique, gratuite, sans API ni compte, pour créer ses questions/réponses et effectuer des **sessions d'auto-évaluation**.

## Principales fonctionnalités
- Banque de 500 questions maximum : énoncé, réponse libre (jusqu'à 1 200 caractères), thème (160 caractères), difficulté et maîtrise déclarée.
- Mode session : tirage mélangé, 5/10/20/50 questions maximum, filtre par thème et par notions non maîtrisées, **réponse masquée**, évaluation manuelle (« J'ai répondu juste » / « Je dois réviser »), score à la fin.
- Tableaux de bord : nombre de questions, maîtrisées, à revoir, taux de maîtrise total et par thème. Les thèmes inhabituels `constructor` et `__proto__` sont gérés sans collisions.
- Recherche sans accents dans les questions, réponses et thèmes ; filtres par thème, maîtrise et difficulté ; tris par ajout, thème et difficulté.
- Révélation indépendante des réponses dans chaque fiche, édition, suppression avec confirmation.
- Export **JSON version 1** pour la sauvegarde/restauration, export CSV avec neutralisation des formules, copie brute pour récupérer un stockage éventuellement endommagé.
- PWA après premier chargement : mode hors ligne pour les fichiers statiques, cache `shell-v2`.

## Utilisation
1. Ajouter une question et sa réponse attendue, un thème et une difficulté.
2. Lancer une session en choisissant le nombre maximum de questions et le thème.
3. Répondre mentalement ou oralement, puis afficher la réponse.
4. **Vous** jugez si votre réponse était correcte ; le score de session est distinct du taux de maîtrise global.
5. Exporter périodiquement une sauvegarde JSON pour conserver vos fiches.

## Contrat de stockage préservé
Clé du navigateur : `louvre-factory:quizcraft:v1`. Structure : `{app:"quizcraft",version:1,records:[...]}`, avec les mêmes champs `id,question,answer,category,difficulty,mastered`. Chaque entrée est revalidée à l'import. La restauration désactive la protection en lecture seule **uniquement après** écriture locale réussie.

La sauvegarde de 500 fiches est limitée à 900 000 caractères JSON ; l'import de fichier est limité à 900 000 octets. Le CSV ne restaure pas les fiches. Les données ne sont pas synchronisées entre appareils et ne sont pas chiffrées au repos.

## Tests
```bash
node --check apps/quizcraft/core.js
node --check apps/quizcraft/app.js
node --test apps/quizcraft/tests/core.test.cjs
python apps/quizcraft/tests/browser.test.py
```
La dernière commande nécessite Chromium et Playwright ; GitHub Actions exécute les tests avec les dépendances nécessaires. Les résultats sont à confirmer dans les journaux du **dernier commit**, pas à inférer de l'existence des tests.

## Limites
QuizCraft **ne reconnaît ni ne corrige automatiquement** une réponse libre : la notation repose sur l'utilisateur. Pas de classement, de chronomètre, de plateforme multi-joueurs ni de synchronisation. Le score de session n'est pas conservé à la fermeture. Les notions maîtrisées sont un indicateur auto-déclaré, pas une mesure objective de compétence.