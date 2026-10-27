# NoteGarden

Notes locales reliées entre elles, gratuites, sans compte et hors ligne.

- Liens internes `[[Titre]]` ou `[[Titre|libellé]]` : un clic ouvre la note, ou la crée si elle n'existe pas.
- Renommer une note réécrit tous les liens qui la visent, dans toutes les notes (libellés conservés).
- Rétroliens avec la ligne citée, notes orphelines (aucune autre note n'y renvoie), liste des « notes à créer ».
- Étiquettes, recherche plein texte insensible à la casse et aux accents (`#étiquette` pour filtrer), extrait surligné.
- Rendu sûr : le texte est découpé en nœuds connus (titres, listes, citations, code, gras, penché, liens internes) ; aucun HTML saisi n'est interprété.
- Export Markdown : archive .zip (un fichier par note, en-tête YAML) ou un seul fichier ; sauvegarde JSON validée avant restauration ; mode protégé si le stockage est illisible.

Limites : 500 notes, 50 000 caractères par note, 20 étiquettes par note. Les liens dans le code (`` `…` `` ou blocs ```) sont ignorés. L'archive .zip n'est pas compressée.

Tests : `bash scripts/test_app.sh notegarden`.
