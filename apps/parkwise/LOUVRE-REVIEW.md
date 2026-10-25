# ParkWise — audit Louvre / cinq ouvrages

**Périmètre :** version Web gratuite et locale. Fiches techniques consultées dans `googGPT/Louvre` (voir chemins ci-dessous). Les références de pages sont **celles documentées par les fiches Louvre**, pas une affirmation de relecture exhaustive des PDF ici. Le code est original, non recopié des ouvrages. Aucun framework n'est imposé parce qu'il apparaît dans un livre.

| Livre et identifiant | Fiche Louvre, chapitre et pages physiques PDF documentées | Application originale dans ParkWise | Limites |
|---|---|---|---|
| **Total TypeScript** (SRC-001) | [`TS16-001`](../../technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md), ch. 16, p. 396–400 | `core.js`: validation *runtime* explicite du schéma JSON, des tarifs entiers en centimes, des identifiants et des positions GPS avant écriture ou restauration | Pas de compilation TypeScript ; des validateurs n'empêchent pas toutes les mauvaises hypothèses tarifaires |
| **The Complete Developer** (SRC-002) | [`FULL08-001`](../../technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md), ch. 8, p. 160–174 | Calculs tarifaires purs, cas limites (plafond, franchises, marche aller-retour), `node --test` + test d'intégration Chrome | Tests couvrant des règles simplifiées, pas tous les modèles tarifaires de parkings réels |
| **Ultimate Next.js** (SRC-003) | [`NEXT08-001`](../../technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md), ch. 8, p. 212–226 | Les résultats de comparaison sont **dérivés de l'état persistant**, jamais sauvegardés en double. Changer la durée recalcule sans corrompre les options | Pas de Next.js/SSR ni serveur : bénéfice de coût et confidentialité |
| **Vue.js 3** (SRC-004) | [`VUE07-001`](../../technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md), ch. 7, p. 186–202 | `core.js` (domaine) séparé de `app.js` (rendu, stockage local, géolocalisation) ; pourrait être repris dans une interface mobile ultérieure | Pas de Vue/Quasar/Supabase : architecture réutilisable, pas application native déjà réalisée |
| **Learning GitHub Actions** (SRC-005) | [`GHA09-001`](../../technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md), ch. 9, p. 210–220 | CI lecture seule avec tests Node/Playwright ; droits Pages exclusivement au job de déploiement après fusion et vérifications | Résultat des tests CI doit être réellement observé, pas présumé |

## Règles métier — hypothèses explicites

- Les données tarifaires sont **saisies par l'utilisateur**. Aucune place disponible en temps réel ni tarif exact externe n'est fourni. Le prix de stationnement réel peut différer.
- Les prix sont des nombres entiers de centimes ; les fractions d'heure sont arrondies à l'heure commencée **après** les éventuelles minutes gratuites ; les frais d'entrée ne sont appliqués qu'une fois, les plafonds sont par tranche consécutive de 24 heures. La facturation par jour calendaire ou 15 min d'un parking réel n'est **pas prise en charge** par ce modèle.
- Le score est le tarif de stationnement + `2 × marche à pied (minutes) × valeur du temps choisie (€/h) / 60`, arrondi aux centimes. C'est une préférence subjective, **pas** un prix facturé.
- La géolocalisation nécessite permission du navigateur, garde l'emplacement localement et ne récupère aucune carte tant que l'utilisateur n'ouvre pas explicitement OpenStreetMap (service externe gratuit indépendant).
- Le fichier de calendrier `.ics` est fourni comme téléchargement : aucun rappel natif en arrière-plan garanti.
- Un navigateur privé ou un nettoyage des données peut effacer les parkings : utiliser la sauvegarde JSON. Si le stockage est illisible, aucune écriture de remplacement n'est effectuée.
- La PWA peut utiliser les fichiers hors ligne après un premier chargement Internet réussi. Elle ne télécharge aucune donnée cartographique.

## Validation reproductible

```
node --check apps/parkwise/core.js
node --check apps/parkwise/app.js
node --check apps/parkwise/sw.js
TZ=Europe/Paris node --test apps/parkwise/tests/core.test.cjs
python apps/parkwise/tests/browser.test.py
```

Le parcours Chrome couvre saisie, classement, édition, GPS simulé, sauvegarde/restauration, calendrier, PWA hors ligne, affichage mobile. Ne revendiquer un succès que d'après le résultat observé. Conserver les tests des cinq autres applications lors de la préparation de l'artefact GitHub Pages.