# Validation de « Trouver mon journal »

- `test_100_articles_2026.json` : 100 articles de 2026 tirés au hasard (1 par revue, 100 revues de l'atlas) — **échantillon de test**, jamais utilisé pour régler l'outil.
- `reglage_200_articles_2026.json` : 200 autres articles de 2026 (autres revues) — échantillon de **réglage** des paramètres.
- `cas_qualitatifs.json` : 16 résumés écrits à la main avec les revues attendues.
- `tirer_articles.py` : tirage OpenAlex. `rang_vraie_revue.js` : rang de la vraie revue (`node rang_vraie_revue.js ../site/index.html ../site/data validation/test_100_articles_2026.json`).

Résultats (24 novembre 2026, échantillon de test) :

| | top 1 | top 10 | top 25 | top 100 | rang médian |
|---|---|---|---|---|---|
| Ancien algorithme | 18 | 47 | 55 | 71 | 14 |
| Nouvel algorithme | 18 | 51 | 63 | 80 | 10 |

Vraie revue mieux classée pour 55 articles, moins bien pour 27 (test des signes, p = 0,003).
