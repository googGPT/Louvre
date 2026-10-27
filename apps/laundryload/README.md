# LaundryLoad

Planificateur de lessives, gratuit, sans compte et hors ligne.

- Vêtements enregistrés : couleur (blanc, clair, couleur vive, foncé), matière, lavage (machine avec température maximale d'étiquette, main, ne pas laver), sèche-linge autorisé, délicat, poids sec estimé (grammes entiers), présence dans le panier.
- Regroupement automatique des articles du panier en charges compatibles, selon des règles explicites :
  - une classe de couleur par charge (blancs et clairs réunis seulement si l'utilisateur le choisit) ;
  - programmes séparés : normal, délicat (case cochée ou soie), laine ;
  - température d'une charge = minimum de ses articles ; écart maximal de température optionnel (même température, 10, 20 ou 30 °C) ;
  - capacité de la machine saisie en kg, remplissage réduit optionnel pour délicat et laine ; remplissage « premier qui convient » par poids décroissant, déterministe.
- Chaque charge est expliquée : couleurs, programme, article qui impose la température et articles lavés sous leur maximum, raison d'un découpage, séchage (sèche-linge / à l'air). Lavage à la main et « ne pas laver » mis de côté.
- Export CSV des charges (en-têtes traduits) ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible ; 300 vêtements au plus.

Limites : la capacité, le remplissage et les poids sont des hypothèses saisies par l'utilisateur ; l'appli ne connaît ni la machine ni les lessives.

Tests : `bash scripts/test_app.sh laundryload`.
