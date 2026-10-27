# ExpenseClassifier

Classement d'un relevé bancaire CSV par règles locales, gratuit, sans compte et hors ligne.

- Import d'un fichier CSV ou d'un texte collé : séparateur (`;` `,` tabulation `|`), décimale (virgule ou point), format des dates (JJ/MM/AAAA, MM/JJ/AAAA, AAAA-MM-JJ) et en-tête détectés, puis modifiables ; colonnes date / libellé / montant à associer (ou débit et crédit séparés). Fichiers UTF-8 ou Windows-1252.
- Les lignes illisibles sont signalées avec leur numéro, jamais devinées.
- Règles par mot-clé (« contient ») ou motif à jokers (`*`, `?`), limitées aux débits ou aux crédits si besoin ; la première règle qui correspond l'emporte (ordre modifiable). Majuscules et accents ignorés.
- Totaux par catégorie (débits, crédits, solde) et par mois ; export CSV classé (en-têtes dans la langue affichée, formules neutralisées).
- Montants en centimes entiers ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : outil de tri, pas de conseil financier ; aucune donnée ne quitte le navigateur. Les montants sont affichés dans la devise choisie, sans conversion. 5 000 opérations au plus.

Tests : `bash scripts/test_app.sh expenseclassifier`.
