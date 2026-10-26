# ShiftLedger — 5 livres Louvre, adaptations vérifiables

- **Total TypeScript** `TS16-001` — `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md`, chapitre 16, pages PDF 396–400 : validation stricte des plages, valeurs numériques et sauvegardes dans `core.js`.
- **The Complete Developer** `FULL08-001` — `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md`, chapitre 8, pages PDF 160–174 : tests du passage de minuit, pauses invalides, majorations, export CSV.
- **Ultimate Next.js** `NEXT08-001` — `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md`, chapitre 8, pages PDF 212–226 : totaux dérivés uniquement dans `compute` et `render`, pas d'état redondant.
- **Vue.js 3** `VUE02-001` — `technical-library/concepts/frontend/VUE02-001-vue-reactivity-localstorage.md`, chapitre 2, pages PDF 40–47 : liste unique persistée, recalcul suite aux mutations UI, stockage validé après rechargement.
- **Learning GitHub Actions** `GHA04-001` — `technical-library/concepts/devops/GHA04-001-workflow-trigger-design.md`, chapitre 4, pages PDF 59–75 : QA dédiée sur Pull Request, Node et Chromium sans secrets.

Références et pages extraites des fiches techniques Louvre réellement consultées ; **aucune relecture PDF originale revendiquée**. Les seuils de rémunération sont des choix métiers de l'utilisateur, non des règles légales du livre. Seule la CI fait foi pour les tests Chromium réels.


## Audit technique v2 — application globale n° 22 — 26 octobre 2026

### Problèmes relevés dans le code initial
1. **Heures égales = 24 h implicites** : `duration=b-a; if(duration<=0)duration+=1440` convertissait deux horaires identiques en 24 h. Désormais erreur explicite, et les horaires de nuit restent possibles.
2. **Seuil quotidien appliqué par service et non par jour** : deux petits services du même jour pouvaient chacun bénéficier du seuil complet. Le moteur regroupe désormais les minutes nettes par **date de début** avant de les répartir en normales/majorées.
3. **Modifications non transactionnelles** : `state.shifts` ou `state.params` étaient modifiés avant de confirmer `localStorage.setItem`. La UI pouvait simuler une sauvegarde inexistante. Désormais `commit` valide et écrit d'abord, puis remplace l'état.
4. **Restauration fragile** : `blocked=false` était défini avant la réussite de la restauration, potentiellement déverrouillant un historique illisible. Les imports refusés ne changent plus l'état et le déverrouillage est conditionné à l'écriture effective.
5. **Risque de double comptage** : aucun avertissement si deux horaires se chevauchaient, y compris après minuit. Le calcul détecte désormais ces cas sans altérer automatiquement les entrées.
6. **Export CSV et contrôle d'entrée** : validation systématique des lignes/IDs, limite de sauvegarde et neutralisation des cellules pouvant être évaluées comme formules dans un tableur, avec apostrophe initiale et échappement des guillemets.

### Nouveautés vérifiables dans le code
Moteur `compute` pur avec jours regroupés, détail des pauses et nuits, filtre/recherche mobile, édition des services, avertissement de chevauchement, indicateurs par date de début, reprise après panne de quota de stockage. Cache SW incrémenté avec suppression de l'ancienne génération.

### Vérifications exigées
`node --check`, tests Node des frontières (temps, dates, pauses, chevauchements et rémunération), Playwright pour le CRUD, les agrégations, les exports et les échecs de persistance, contrôle mobile 390 px et hors ligne. Décrire **uniquement les résultats effectivement constatés** dans le dernier run CI.

### Limites et précautions
- **Le temps de travail réellement rémunérable est conventionnel** : passage de minuit compté à la date de début et durée fondée sur l'horloge, sans prise en compte de changement d'heure. Aucune conformité juridique ou salariale certifiée.
- Le seuil et le multiplicateur sont déclaratifs, une majoration par jour de début n'est pas automatiquement une règle légale.
- Les chevauchements sont des **alertes** et non une correction silencieuse.
- Les données restent stockées en clair côté navigateur ; JSON v1 et clé historique inchangés.
- L'application utilise des principes dérivés des **fiches Louvre** ci-dessus ; aucune nouvelle lecture de PDF original n'est revendiquée.

### Ordre et périmètre
ShiftLedger est `02/20` de la vague 2, soit app n° 22 au cumul. ColorContrast est `03/20` selon le registre, en dépit de sa PR #40 intitulée `02/20`. On ne modifie pas cette autre application ni `main` pendant cet audit. L'infrastructure de publication additive figure dans la PR #39 : **ne pas fusionner ShiftLedger sans accord explicite et contrôle de dépendance**.
