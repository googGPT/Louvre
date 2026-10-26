# WorldMeet v2 — planification multi-fuseaux locale

**Application Louvre 14**, gratuite, mobile-first, sans compte, backend, API ou bibliothèque de cartographie : https://googgpt.github.io/Louvre/apps/worldmeet/ (après fusion de la PR #31 et déploiement).

## Mode d'emploi

1. Entrez une **heure de référence en UTC** au format AAAA-MM-JJ HH:mm. Le champ `datetime-local` du navigateur ne convertit pas votre fuseau : il sert ici seulement à saisir les chiffres de l'UTC. L'indication à côté affiche la correspondance dans le fuseau choisi.
2. Ajoutez un participant ou une ville avec son identifiant de fuseau **IANA**. Répétez avec le même titre de réunion et la même heure UTC pour obtenir la comparaison sur une seule fiche de réunion.
3. Sélectionnez la réunion, sa durée et la plage horaire de travail déclarative. La liste compare l'heure de chacun, l'offset UTC, le jour précédent/suivant et le statut de plage théorique.
4. Les suggestions parcourent les **24 prochaines heures** UTC en pas de 30 min pour trouver des plages communes ; elles ne consultent **aucun agenda** et ne garantissent pas la disponibilité réelle ni l'absence de weekend.
5. Téléchargez un fichier **ICS** standard contenant le même instant UTC, ou sauvegardez/restaurez les entrées JSON locales. Les destinataires doivent accepter l'invitation via leur propre agenda ; cette app n'envoie aucun email.

## Garanties et limites

- Conversions `Intl.DateTimeFormat` et identifiants IANA fournis par le navigateur, passage à l'heure d'été/hiver, décalages de 30 min, dates de la veille/du lendemain.
- Les décisions concernant les heures de bureau sont des filtres d'heure locale sans comparaison aux calendriers réels, jours fériés, réunions réservées ou préférences personnelles.
- Les changements futurs de loi sur l'heure d'été peuvent ne pas être reflétés tant que le navigateur n'actualise pas sa base de fuseaux.
- Schéma et clé de sauvegarde `worldmeet` **version 1 inchangés**, 500 correspondances maximum, stockage navigateur non chiffré : exporter le JSON et garder le fichier privé.
- PWA hors ligne après premier chargement HTTPS réussi ; aucune notification ni synchronisation inter-appareils.
- L'ICS est un fichier téléchargé par l'utilisateur, pas une réservation créée dans son compte calendrier.

## Tests

```bash
node --check apps/worldmeet/core.js
node --check apps/worldmeet/app.js
TZ=Europe/Paris node --test apps/worldmeet/tests/core.test.cjs
python apps/worldmeet/tests/browser.test.py
```

Le test Chromium doit réussir sur GitHub Actions avant fusion. Lire `LOUVRE-REVIEW.md` pour les adaptations documentées des cinq livres.