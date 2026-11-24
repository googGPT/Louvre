# Validation de « Trouver mon journal »

## Échantillons (articles publiés en 2026, OpenAlex, une revue tirée au hasard par article)
- `reglage_200_articles_2026.json` : 200 articles pour **régler** les paramètres.
- `test_100_articles_2026.json` + `test_400_articles_2026.json` : 500 articles de **test**, jamais utilisés pour le réglage.
- `cas_qualitatifs.json` : 16 résumés écrits à la main avec les revues attendues.

**Important** : pendant le test, les articles tests sont retirés des données d'entraînement (253 des 700 articles y figuraient,
car certains articles de 2026 sont déjà parmi les plus cités de leur revue). Sans ce retrait, les scores sont gonflés.

## Scripts
- `tirer_articles.py`, `tirer_400_articles.py` : tirage OpenAlex.
- `compare.py` (+ `bd_terms.py`) : comparaison en Python de plusieurs algorithmes classiques sur les mêmes articles
  (`python3 compare.py dev,test500` depuis un dossier contenant les échantillons ; chemins à adapter).
- `rang_vraie_revue.js` : rang de la vraie revue avec le code du site (`node rang_vraie_revue.js ../site/index.html <dossier données> <échantillon>`).

## Résultats (25 novembre 2026, 500 articles tests, données sans les articles tests)

| Algorithme | Erreur top 10 | Erreur top 25 | Vraie revue 1re | Rang médian | MRR | Erreur de domaine* |
|---|---|---|---|---|---|---|
| Algorithme d'origine (23 nov.) | 62,4 % | 49,4 % | 11,8 % | 25 | 0,194 | 45,6 % |
| Version du 24 nov. (Rocchio 150 termes + articles) | 57,2 % | 42,6 % | 11,6 % | 15 | 0,219 | 38,2 % |
| Rocchio + BM25, avec pondération de spécificité | 51,8 % | 38,8 % | 13,2 % | 12 | 0,243 | 37,0 % |
| **Rocchio + BM25 (retenu)** | **49,0 %** | **36,8 %** | **14,4 %** | **9** | **0,257** | 38,0 % |

\* la 1re revue proposée ne partage aucune discipline avec la vraie revue.

Comparaison en Python (même découpage, sans élagage) : TF-IDF seul, Rocchio, BM25, vraisemblance de Dirichlet
(Zhai et Lafferty, 2001), k plus proches voisins (Yang, 1999) et mélanges. Le mélange Rocchio + BM25 a eu l'erreur la plus faible ;
la version déployable (termes employés au moins deux fois par revue, poids sur 1 octet) perd moins de 0,5 point.

Retenu contre la version du 24 nov. : vraie revue mieux classée pour 244 articles, moins bien pour 153 (test des signes, p < 0,0001).

## Pistes d'amélioration testées le 25 novembre 2026 (sans gain, donc non retenues)

Réglage sur les 200 articles, erreur top 10 de référence : 48,5 % (103/200 dans le top 10).

| Piste | Erreur top 10 (réglage) | Décision |
|---|---|---|
| Titre compté 1 ou 3 fois (au lieu de 2) | 48,5 % | inchangé |
| Mots-clés comptés 1 ou 3 fois | 48,0 % / 49,5 % | écart non significatif |
| Expressions de deux mots pondérées ×0,5 / ×1,5 | 51,0 % / 48,5 % | non |
| A priori sur la taille de la revue | 48,5 % / 49,5 % | non |
| Rétroaction de pertinence aveugle (Rocchio, 1971), 5 ou 10 revues | 54,5 % / 55,0 % | non (plus d'erreurs) |
| + 30, 50 ou 100 articles récents (2024-2025) par revue (`compare_stream.py`) | test : 48,4 / 48,0 / 50,0 % contre 47,8 % | non : meilleur 1er choix et top 25, mais pas moins d'erreurs top 10, et index plus lourd |

Prochaine étape possible : une similarité sémantique (plongements de type SPECTER ; Cohan et al., 2020), qui demande un modèle
téléchargé dans le navigateur. En attendant, le bouton « Affiner avec Claude » joue ce rôle sur les 15 premières revues.
