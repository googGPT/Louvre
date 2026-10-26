# ShiftLedger v2 — Louvre application 22 (vague 2, n° 02/20)

Journal des services et estimation de rémunération théorique. Application Web statique gratuite, privée, sans API payante ni serveur. **Ce n'est pas une application de paie réglementaire.**

## Fonctions
- Créer, modifier et supprimer (avec confirmation) jusqu'à **500 services** : date de début, début/fin, pause non rémunérée entière en minutes, étiquette.
- Une fin antérieure au début signifie le lendemain. **Début = fin refusé** pour ne pas interpréter silencieusement une durée de 24 heures.
- Tableau de bord : heures brutes, pauses déduites, heures nettes, heures normales, heures majorées, rémunération brute estimée, nombre de services de nuit.
- Total quotidien : **les durées nettes des services ayant la même date de début sont additionnées AVANT l'application du seuil quotidien**. Les services commençant un autre jour disposent de leur propre seuil.
- Recherche sans accents, filtrage mensuel par date de début, historique trié, récapitulatif par jour de début, avertissements de plages potentiellement chevauchantes.
- Export JSON v1, import validé, copie brute de secours, export CSV en UTF-8 avec BOM et neutralisation des formules.
- PWA hors ligne après première visite valide (cache `wave2-shiftledger-v2`) ; interface adaptée aux petits écrans.

## Modèle de calcul (déclaratif)

Pour chaque service : durée brute = différence d'horloge, traversant éventuellement minuit (maximum 23h59). Durée nette = durée brute − pause non rémunérée.

Pour chaque **jour de début** `d` :
- `N_d = somme des minutes nettes des services du jour`.
- `H_base,d = min(N_d, seuil × 60)` et `H_majorées,d = max(N_d − seuil × 60, 0)`.
- `Brut_estimé = arrondi_en_centimes([ΣH_base + multiplicateur × ΣH_majorées] × taux_horaire / 60)`.

Le taux (0–1000 €/h), seuil (1–24 h) et multiplicateur (1–4) sont définis **par l'utilisateur**, sans règle légale intégrée. Le seuil est converti en minutes par arrondi au plus proche.

**Limites importantes** : un service traversant minuit est intégralement compté à la date de début ; la position précise de sa pause n'est pas renseignée. Les différences sont des *durées d'horloge* et ne compensent pas les changements heure d'été/hiver ; on n'utilise ni fuseau horaire ni pointage certifié. Les chevauchements sont signalés mais **pas supprimés automatiquement** : risque de double comptage tant qu'ils ne sont pas corrigés. La majoration quotidienne est une hypothèse de simulation qui ne vaut pas convention collective ni loi. Aucun coût patronal, cotisation, indemnité, minimum légal, congé payé ou planning contractuel calculé.

## Fiabilité des données

La clé de stockage et le format historique restent `louvre-wave2-shiftledger-v1` et `{version:1,shifts:[...],params:{rate,threshold,multiplier}}`. Aucune migration destructive.

Les modifications du modèle ne sont validées dans l'affichage **qu'après succès de `localStorage.setItem`**. Si le stockage d'origine est corrompu, ajouts/modifications/suppressions et changement des paramètres sont bloqués. Télécharger la copie brute puis restaurer un **JSON valide** ; un import qui échoue ne lève pas le verrou. Les fichiers exportés ne sont pas chiffrés, les données ne sont pas synchronisées, et le navigateur peut effacer son stockage. Limites : 500 services et 300 000 caractères JSON (fichier importé : 300 000 octets).

## QA
```bash
node --check apps/shiftledger/core.js
node --check apps/shiftledger/app.js
node --check apps/shiftledger/sw.js
node --test apps/shiftledger/tests/core.test.cjs
python apps/shiftledger/tests/browser.test.py
```

La dernière commande nécessite Playwright et Chromium ; la CI dédiée sur PR exécute les tests. Ne pas prétendre à leur succès sans vérifier les journaux du dernier commit.

## Traçabilité
La bibliothèque Louvre est consultée via les fiches TS16-001, FULL08-001, NEXT08-001, VUE02-001 et GHA04-001 précisées dans `LOUVRE-REVIEW.md`. Leur contenu a inspiré des adaptations **originales**, pas des copies de code.

Note de numérotation : le registre `LOUVRE-WAVE2-TRACKER.md` numérote ShiftLedger **02** et ColorContrast **03**, alors que la PR ColorContrast #40 est titrée « 02/20 » par erreur. Cette collision est à corriger lors de la revue de la PR ColorContrast ; la branche ShiftLedger n'y apporte aucune modification.
