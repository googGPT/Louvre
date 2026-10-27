# RegexWorkbench

Atelier d'expressions régulières JavaScript, gratuit, sans compte et hors ligne.

- Drapeaux `g i m s u y`, correspondances surlignées, positions, groupes numérotés et nommés (groupes non utilisés signalés).
- Aperçu du remplacement (`$&`, `$1`…`$99`, `$<nom>`, `` $` ``, `$'`, `$$`) : le résultat est recalculé par `core.js` selon la même règle que `String.prototype.replace` (vérifié dans les tests), ce qui permet de surligner les morceaux remplacés.
- Exécution dans un Web Worker avec délai maximal réglable (100 à 10 000 ms, 1 000 par défaut) : au-delà, le Worker est arrêté (`terminate`) et recréé, et un message explique la cause probable (retour arrière catastrophique). La page ne fait que compiler l'expression ; elle ne la fait jamais tourner sur le texte.
- Explication simple de chaque élément (classes, groupes, assertions, quantificateurs, références arrière…) et alerte sur les quantificateurs imbriqués comme `(a+)+`.
- Bibliothèque d'expressions enregistrées ; brouillon et réglages conservés ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage est illisible.

Limites : moteur JavaScript du navigateur (pas PCRE ni Python) ; 200 000 caractères de texte, 10 000 correspondances, drapeaux `d` et `v` non proposés. L'explication est une aide de lecture, pas un analyseur complet.

Tests : `bash scripts/test_app.sh regexworkbench`.
