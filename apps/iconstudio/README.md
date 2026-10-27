# IconStudio

Éditeur de petites icônes SVG, gratuit, sans compte et hors ligne.

- Grille de 16, 24, 32 ou 48 cases ; formes rectangle (coins arrondis), cercle, ligne, polyligne (ouverte ou fermée) et chemin (commandes M L H V C Q Z).
- Coordonnées validées au demi-pas, dans la grille ; épaisseur de trait, remplissage, contour, bouts arrondis ; une forme invisible est refusée.
- Calques (monter, descendre, dupliquer, supprimer), déplacement au clavier, dessin au clavier (viseur, Entrée pour poser un point), annuler / rétablir (Ctrl+Z, Ctrl+Y).
- Changement de grille avec mise à l'échelle des formes.
- Aperçu de 16 à 128 px sur fond clair et sombre ; contrôle du contraste de chaque couleur avec le fond (seuil indicatif 3:1, WCAG 1.4.11).
- Export SVG minimal (`viewBox`, aucun script, aucun style, aucun lien) reconstruit attribut par attribut à partir de valeurs validées ; export PNG.
- Import des SVG simples : seules les formes prises en charge sont reconstruites, tout le reste (script, style, liens, images, transformations) est ignoré.
- Bibliothèque locale d'icônes ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites : pas d'ellipse, d'arc (`A`), de dégradé ni de texte ; un SVG importé avec des transformations perd les formes transformées. Le contraste compare chaque couleur au fond, pas aux formes qu'elle recouvre.

Tests : `bash scripts/test_app.sh iconstudio`.
