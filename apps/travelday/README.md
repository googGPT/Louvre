# TravelDay v2 — organiseur local des journées de voyage

Web app **gratuite, sans compte, sans API, sans géolocalisation et sans serveur de données**. Elle construit un itinéraire par journée, additionne les budgets et signale les chevauchements horaires.

## Fonctions réellement disponibles

- Activités : date, lieu, début et fin, coût, catégorie, note facultative ; enregistrement, édition, suppression confirmée, recherche.
- **Conflits exacts :** toutes les paires d'activités en chevauchement sont examinées, même si une longue visite englobe plusieurs plus courtes ; les horaires qui se touchent exactement ne se chevauchent pas. Les activités nocturnes finissant le lendemain sont prises en compte dans les conflits avec la date suivante.
- **Budget au centime par activité** ; ventilation par journée ; durée cumulée d'activités. Le calcul ne suppose aucun prix de réservation réel.
- **Marge de déplacement paramétrable** (0, 10, 15, 30, 60 minutes). C'est un avertissement de temps libre entre activités, pas une estimation cartographique.
- Filtre par date et recherche insensible aux accents, aperçu des conflits avant ajout, trois étapes de démonstration facultatives, mode impression.
- Export **CSV** compatible tableur avec neutralisation des cellules commençant par des formules ; export **ICS** d'événements à heures *flottantes* (sans identifiant de fuseau) à importer dans le fuseau du voyage ; sauvegarde **JSON complète** et restauration strictement validée.
- PWA hors ligne après chargement et installation initiale sur HTTPS/localhost, interface mobile.

## Compatibilité des versions précédentes

- Même clé de stockage : `louvre-factory:travelday:v1`.
- Même schéma JSON `{"app":"travelday","version":1,"records":[...]}`. Les fiches historiques sans catégorie ni notes sont acceptées ; valeurs par défaut : `category: "Activité"`, `notes: ""`.
- Limite : 500 fiches, taille de restauration ≤900 000 caractères JSON ; export JSON régulièrement conseillé.

## Tester

```sh
node --check apps/travelday/core.js
node --check apps/travelday/app.js
node --test apps/travelday/tests/core.test.cjs
python -m pip install 'playwright>=1.45,<2'
python apps/travelday/tests/browser.test.py
```

Pour le test navigateur, Chromium est exécuté sur le runner GitHub Actions en ouvrant un serveur local temporaire. L'environnement de développement actuel bloque l'ouverture HTTP locale : ce résultat local ne constitue pas une défaillance applicative ; seuls les logs du runner font foi pour le résultat navigateur.

## Limites

Les horaires sont saisis **en heure civile locale supposée** : pas de fuseau ni d'ajustement automatique lors des changements d'heure. Les événements `.ics` emploient des heures flottantes, donc le calendrier d'importation peut appliquer son propre fuseau ; vérifier après import. Pas de calcul de distance, temps de transport, durée de visite réelle, horaire d'ouverture, réservation, disponibilité ou prix réel. Les activités commençant et finissant exactement à la même heure sont refusées pour éviter toute ambiguïté (durée nulle ou 24 h). Un séjour multi-fuseau nécessite de convertir les heures avant saisie. Les données restent uniquement dans le navigateur, sans chiffrement propre à l'application, et peuvent être effacées par le navigateur.