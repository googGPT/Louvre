# JSONInspector

Validateur et explorateur JSON, gratuit, sans compte et hors ligne.

- Analyseur maison strict (RFC 8259) : ligne et colonne exactes de l'erreur, extrait de la ligne fautive, message précis (virgule en trop, commentaire, apostrophes, clé sans guillemets, zéro initial, échappement invalide, texte en trop…).
- Détection des clés dupliquées dans un même objet (JSON.parse garde la dernière sans prévenir) et des nombres qui perdraient de la précision (entiers au-delà de 2^53, plus de 17 chiffres, dépassement).
- Arbre repliable chargé par morceaux, chemin JSONPath de l'élément choisi (copiable), « aller au chemin », aperçu de la valeur.
- Statistiques : profondeur, nombre de clés et de noms distincts, valeurs par type, taille UTF-8, lignes.
- Formatage (2 ou 4 espaces, tabulation) et minification fidèles : clés dupliquées et nombres recopiés tels quels.
- Gros fichiers (jusqu'à 25 Mo) analysés dans un Web Worker : la page reste réactive ; au-delà de 400 000 caractères, le fichier est en lecture seule et n'est pas enregistré.
- Plusieurs documents enregistrés automatiquement ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : pas de JSON5 ni de commentaires (signalés comme erreurs) ; la colonne compte des caractères (un émoji = 1) ; le formatage normalise les échappements des chaînes (é devient é).

Tests : `bash scripts/test_app.sh jsoninspector`.
