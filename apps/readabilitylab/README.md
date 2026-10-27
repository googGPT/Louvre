# ReadabilityLab

Mesure de la longueur des phrases et indicateurs simples de lisibilité, gratuit, sans compte et hors ligne. Le texte analysé reste dans le navigateur.

- Découpage en phrases tenant compte des abréviations (M., Dr., z. B., p. ej.…), des initiales, des nombres décimaux (3,14 ; 3.5), des listes numérotées, des points de suspension et de la ponctuation arabe (؟ termine une phrase ; ، et ؛ non).
- Mots : nombres d'un seul tenant, mots composés gardés, élisions séparées en français et en italien (l'école = 2 mots).
- Mesures : phrases, mots, moyenne, médiane et maximum de mots par phrase, distribution, phrases trop longues (seuil réglable, sélection dans le texte), mots longs (seuil en lettres), mots pleins répétés, mots doublés (« les les »).
- Formules, seulement pour la langue déclarée du texte :
  - anglais : Flesch Reading Ease (Flesch, 1948) et Flesch-Kincaid Grade Level (Kincaid et al., 1975) ;
  - français : Kandel et Moles (1958) ;
  - espagnol : Fernández Huerta (1959), sous la forme usuellement citée ;
  - allemand : Amstad (1978) ;
  - portugais du Brésil : Flesch adapté par Martins et al. (1996) ;
  - italien : Gulpease (Lucisano et Piemontese, 1988), fondé sur les lettres.
  Aucune formule pour l'arabe ni pour « autre langue ».
- Exports : phrases en CSV (en-têtes traduits), sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Limites assumées : le comptage des syllabes est une approximation orthographique (groupes de voyelles, e muet français, hiatus espagnol/italien/portugais) ; les scores sont indicatifs et peu fiables sous une centaine de mots. Les répétitions ne regroupent pas les formes fléchies (pas de lemmatisation). Les constantes des formules sont reprises de la littérature sans vérification ici sur les publications originales.

Tests : `bash scripts/test_app.sh readabilitylab`.
