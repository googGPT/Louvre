# LaundryDecoder

Décodeur des symboles d'entretien textile, gratuit, sans compte et hors ligne.

- 38 symboles en 6 catégories : lavage (températures, programmes modéré et très modéré, main, interdit), blanchiment, sèche-linge, séchage naturel (fil, à plat, sans essorer, à l'ombre), repassage, entretien professionnel (nettoyage à sec P / F, nettoyage à l'eau W).
- Combinaison d'une étiquette : consignes résumées par famille ; quand deux symboles d'une même famille se contredisent, la consigne la plus prudente est retenue (température minimale, programme le plus doux, solvant F plutôt que P) et le conflit est signalé.
- Avertissements : aucun mode de nettoyage autorisé, sèche-linge interdit sans séchage naturel indiqué, blanchiment autorisé avec lavage interdit ; familles absentes listées (l'appli ne devine rien).
- Dictionnaire avec recherche sans accents ni casse (mots ou température : « 40 »).
- Étiquettes enregistrées (vêtement + symboles), export SVG de chaque étiquette ; sauvegarde JSON validée avant restauration ; protection si le stockage local est illisible.

Pictogrammes simplifiés dessinés pour l'appli, dans l'esprit des familles de symboles (bassine, triangle, carré, fer, cercle) : aucune illustration officielle n'est reproduite. L'appli n'est affiliée à aucun organisme.

Tests : `bash scripts/test_app.sh laundrydecoder`.
