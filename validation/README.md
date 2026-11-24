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
