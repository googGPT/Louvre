# CareerMatch

Comparaison lexicale d'un CV et d'une offre d'emploi, gratuite, sans compte et hors ligne.

- Mots normalisés : minuscules, sans accents ; en arabe, voyelles brèves, tatwil et formes d'alif unifiées ; élisions (l', d') retirées ; « C++ », « C# », « Node.js » conservés ; nombres seuls ignorés.
- Mots vides retirés selon la langue des textes (7 langues, listes courtes et générales), plus une liste de termes à ignorer saisie par l'utilisateur.
- Rapprochement léger des singuliers et pluriels (désactivable) ; expressions de plusieurs mots vérifiées telles quelles.
- Termes de l'offre présents ou absents du CV, triés par fréquence ; taux de couverture simple et pondéré par la fréquence dans l'offre ; limite facultative aux 20 ou 50 termes les plus fréquents.
- Plusieurs comparaisons (une par offre, le CV est repris) ; export CSV des termes ; sauvegarde JSON validée ; mode protégé.

Limites assumées : simple décompte de mots. Ni prédiction, ni avis de recrutement, ni imitation d'un logiciel de tri ; aucun synonyme reconnu ; racinisation volontairement minimale.

Tests : `bash scripts/test_app.sh careermatch`.
