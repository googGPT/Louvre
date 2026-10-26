# MileageBook v2

Application gratuite et statique pour enregistrer des trajets, estimer le montant au taux **saisi par l'utilisateur**, suivre le remboursement et préparer des exports.

## Fonctions
- Date, motif, distance parcourue, taux personnalisé et statut de remboursement, avec départ, arrivée, catégorie et véhicule facultatifs.
- Montant arrondi **au centime pour chaque trajet**, puis agrégé en entiers afin d'éviter les dérives en virgule flottante.
- Répartition total estimé / remboursé / à rembourser. Filtres année, mois, statut, recherche accent-insensible ; graphiques des montants mensuels filtrés.
- Bouton « Marquer remboursé / non remboursé ». Avertissement en cas de trajet très similaire sans blocage des doublons légitimes.
- Export CSV exploitable dans Excel avec neutralisation des formules, et JSON complet validé avant import atomique.
- PWA hors ligne après première ouverture réussie (service worker). Responsive ordinateur/mobile ; aucune dépendance, aucun serveur ni API payante.

## Conservation des anciennes données
La clé `localStorage` reste `louvre-factory:mileagebook:v1` et les sauvegardes utilisent `app:mileagebook, version:1`. Les anciens enregistrements ne possédant que cinq champs sont enrichis au chargement avec `category:'Non précisé'`, `origin:''`, `destination:''`, `vehicle:''`, sans modifier les valeurs originales. **Ne pas effacer ses données de navigateur sans exporter son JSON.**

## Tester
`node --check core.js && node --check app.js && node --check sw.js`
`node --test tests/core.test.cjs`
`python tests/browser.test.py` (Playwright + Chromium ; exécutable système sur runners GitHub).

## Limitations importantes
- Le taux €/km est une **valeur privée manuelle**. Il ne provient pas d'un barème fiscal ou social, ne définit aucune éligibilité ni aucun droit au remboursement.
- Le bouton « Remboursé » traduit une déclaration de l'utilisateur, sans lien bancaire.
- Le CSV est un export de relevé, **pas une preuve** de déplacement, de dépense ou de paiement.
- Les données restent dans le navigateur, sans chiffrement dans le profil. Maximum 500 trajets et 900 Ko par sauvegarde. Aucun multi-appareils ni notifications serveur.
- La distance correspond au trajet effectivement parcouru, y compris l'aller-retour si l'utilisateur le saisit ainsi : l'application ne double pas arbitrairement le kilométrage.