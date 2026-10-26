# CSVClinic — Louvre App Factory vague 2

Parseur CSV original, sans backend ou sauvegarde de fichiers cachée. Détecte le séparateur, lit les guillemets échappés/retours lignes, supprime les doublons, exporte les cellules potentiellement interprétées comme formules en les neutralisant. Limites : 1 Mo, 40 colonnes, 5 000 lignes, pas de typage métier ni d'audit statistique avancé.

**Différence avec les 27 produits Louvre** : aucun ne parse/nettoie des fichiers tabulaires. Aucun compte, aucune API payante. Service worker ne met en cache que les scripts de l'app, jamais les fichiers importés. La confidentialité dépend du navigateur/appareil.

Tester : `node --test tests/core.test.cjs` et `python tests/browser.test.py`. GitHub Actions doit confirmer l'exécution réelle sur Chromium.
