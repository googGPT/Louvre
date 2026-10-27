# KeyboardCoach

Entraînement à la frappe au clavier, gratuit, sans compte et hors ligne.

- 12 textes (français et anglais, trois niveaux), séances de 30, 60 ou 120 secondes.
- Le chronomètre démarre à la première saisie ; pause automatique si la page est masquée.
- Mesures : vitesse brute et vitesse corrigée (caractères corrects / 5 par minute), précision, erreurs position par position (lettres accentuées comptées comme un caractère).
- Coller, glisser-déposer et insertion automatique sont bloqués pendant le test.
- Historique facultatif (case à cocher) : 30 séances au plus, conservées sur l'appareil, export CSV. Aucune frappe ni texte saisi n'est enregistré.

Tests : `bash scripts/test_app.sh keyboardcoach` (11 tests métier + test Chromium).
