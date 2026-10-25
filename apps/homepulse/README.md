# HomePulse — Web 1.0

Application web locale et progressive (PWA) pour suivre l'entretien domestique. Gratuit, sans inscription, API, backend, base hébergée, analytics, police ou script externe.

## Fonctionnalités

- Fiches d'entretien : nom, pièce, catégorie, date, fréquence en jours, notes et photo compressée localement.
- Priorités recalculées sur la date de l'appareil : retard, échéances sous 7 jours, prochaines dates.
- Validation d'une intervention : date, coût en centimes, note, historique, calcul de la prochaine date à partir de **la date d'intervention**.
- Modifications et suppression confirmée (supprime aussi l'historique de l'équipement).
- Suggestions de 5 tâches **purement indicatives**, sans prétendre prescrire des intervalles de sécurité réglementaires.
- Export JSON et restauration validée **avant** écriture atomique IndexedDB ; export `.ics` calendrier.
- PWA accessible hors ligne après chargement réussi du shell et contrôle par service worker ; pas de push si fermée.

## Architecture et tests

- `core.js`: fonctions métier pures, état typé par validation à l'exécution, dates civiles, calculs en centimes, sérialisation ICS.
- `app.js`: rendu HTML avec `textContent`, adaptateur IndexedDB transactionnel, interactions utilisateur, compression photo dans `canvas`.
- `sw.js`: cache limité aux fichiers de l'app sous son propre scope, jamais de données privées.
- `tests/core.test.cjs`: suite native Node sans `npm install`, avec cas limites / sécurité / DST.
- `tests/browser.test.py`: test Chrom(e/ium) Playwright de parcours complet sur petit écran, lancé par GitHub Actions ; cet environnement de création ne permet pas la navigation Playwright locale (ERR_BLOCKED_BY_ADMINISTRATOR).

Commandes : `TZ=Europe/Paris node --test apps/homepulse/tests/core.test.cjs`, puis `python apps/homepulse/tests/browser.test.py` dans un environnement Chromium autorisé.

## Confidentialité et limites

Les informations sont stockées dans IndexedDB sur **l'appareil et le navigateur en cours**. Elles peuvent disparaître si le stockage est effacé ou si l'appareil est perdu : utilisez régulièrement l'export JSON, qui peut contenir photos et détails privés. Pas de synchronisation multidevices. L'import demande une confirmation avant remplacement, sans fusion automatique des contenus.

Aucune notification arrière-plan garantie ; le fichier calendrier permet d'utiliser un service de rappel choisi par l'utilisateur. Les dates et fréquences sont choisies par l'utilisateur. Les recommandations techniques, notices du fabricant, obligations légales et interventions de professionnels qualifiés prévalent, notamment pour chaudière, électricité, gaz et détecteurs.

Dépôt Louvre : déploiement GitHub Pages existant, sans coûts supplémentaires d'API ; soumis aux quotas/conditions GitHub et aux coûts éventuels d'accès Internet habituels.