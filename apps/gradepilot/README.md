# GradePilot v2 — Application 21 Louvre (vague 2, n° 01/20)

GradePilot calcule une **moyenne pondérée de notes sur 20** et la **note minimale** à obtenir lors d'une prochaine évaluation, avec une simulation personnelle de ce prochain résultat. Application statique entièrement locale, sans compte ni API payante.

## Principe mathématique

Moyenne actuelle = Σ(note × coefficient) / Σ(coefficients).

Pour une moyenne cible `T`, une prochaine évaluation de coefficient `c`, une somme pondérée `S` et un total de coefficients `W`, la note brute requise vaut :

`R = [T × (W + c) − S] / c`

- `R <= 0` : l'objectif est **déjà atteint même avec zéro** à la prochaine évaluation.
- `0 < R <= 20` : la note affichée est **arrondie vers le haut au centième** (pour ne pas annoncer une note insuffisante).
- `R > 20` : objectif **impossible avec cette seule prochaine note**.
- La moyenne projetée pour une note hypothétique `x` vaut `(S + x × c)/(W + c)`.
- Le simulateur affiche aussi la fourchette obtenue avec `x=0` et `x=20`.
- Si aucune note n'est encore saisie, seule la prochaine évaluation est prise en compte pour la projection.

Les calculs ne reproduisent pas les arrondis officiels, la compensation entre matières ou les règles propres à chaque établissement.

## Fonctions

- Ajout, modification, suppression confirmée et recherche sans accents des notes.
- Moyenne et projection recalculées dès la modification d'un coefficient, d'un objectif ou d'une note simulée.
- Saisie des coefficients relatifs entre 0,01 et 100 ; notes et objectifs de 0 à 20.
- Export JSON de sauvegarde, export CSV en UTF-8 avec protection contre les formules, import JSON validé, copie brute de récupération.
- PWA hors ligne après première visite réussie, interface responsive 390 px.

## Protection du stockage et compatibilité

Le format antérieur est **conservé** : clé `louvre-wave2-gradepilot-v1`, données `{"version":1,"grades":[{"id":"...","label":"...","score":16,"coefficient":2}]}`.

- Maximum **200 notes**, validation stricte avant tout stockage/import.
- Les mutations sont **transactionnelles** : l'état visible ne change qu'après `localStorage.setItem` réussi. Si le quota est dépassé, les notes en mémoire ne sont pas marquées comme enregistrées.
- Si le stockage devient illisible, ajout/modification/suppression/effacement sont bloqués. La **copie brute** peut être téléchargée ; un import JSON valide lève le verrou uniquement après enregistrement réussi. Un import invalide ou une écriture échouée ne modifient pas la sauvegarde corrompue.
- Une sauvegarde JSON valide **ne peut pas** être exportée depuis un stockage corrompu pour éviter de proposer un faux fichier vide.
- Les changements d'un autre onglet sont détectés via l'événement `storage`.
- Les données locales peuvent être effacées par le navigateur ; conserver les exports hors du navigateur. Elles ne sont pas chiffrées dans le profil local ni synchronisées entre appareils.

## Vérifications

```bash
node --check apps/gradepilot/core.js
node --check apps/gradepilot/app.js
node --check apps/gradepilot/sw.js
node --test apps/gradepilot/tests/core.test.cjs
python apps/gradepilot/tests/browser.test.py
```

Le dernier test nécessite Python, Playwright et Chromium. La GitHub Action `.github/workflows/louvre-wave2-gradepilot-qa.yml` l'exécute sur la PR.

**Aucune fusion dans `main`** avant vérification de la CI et approbation explicite. La PR de vague 2 inclut une infrastructure de publication additive ; le contrôle des fichiers hors application est indispensable avant intégration.
