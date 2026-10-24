# Instructions pour Codex

Ces règles s'appliquent à l'ensemble du dépôt et à toutes les futures fiches techniques.

## Sources et honnêteté documentaire

- Ne jamais inventer une source, une citation, une page ou un résultat de test ou d'analyse.
- Distinguer explicitement les **faits issus des ouvrages**, les **interprétations** et les **recommandations techniques**. Ne pas présenter une interprétation comme un propos de l'auteur.
- Ne jamais prétendre avoir examiné un livre sans accès effectif à son contenu. Un fichier fourni dans une autre conversation n'est pas présumé accessible ici.
- Conserver la traçabilité des connaissances : identifiant de source du catalogue, édition si vérifiée, chapitre, page PDF vérifiée et référence précise pour chaque affirmation attribuée à un ouvrage.
- Signaler les informations manquantes ou non vérifiées ; ne pas compléter les métadonnées bibliographiques par supposition.
- Distinguer la page du fichier PDF de la pagination imprimée. Ne renseigner une page comme vérifiée qu'après consultation effective.

## Qualité technique

- Vérifier la compatibilité des pratiques techniques avec les versions logicielles réellement utilisées ; documenter ces versions et les vérifications effectuées.
- Privilégier les architectures maintenables, les tests pertinents et la sécurité.
- Identifier explicitement les conditions d'application, les limites et les risques de chaque technique.
- Fournir des exemples originaux et séparer les validations exécutées, leurs résultats observés et les tests restant à réaliser.

## Protection des contenus et du dépôt

- Ne jamais publier les PDF dans ce dépôt ni reproduire de longs extraits protégés. Privilégier les synthèses originales et les références précises.
- Ne pas effectuer d'actions destructrices sans autorisation explicite ; cela inclut notamment la suppression de branches ou l'écrasement de travaux existants.
- Utiliser le checkout existant : chaque tâche cloud dispose déjà d'un environnement isolé. Ne créer aucun worktree sans demande explicite.
- Pour l'étape 1, créer uniquement les quatre documents demandés. Ne commencer aucune extraction ou analyse des ouvrages, ne pas réutiliser `codex/capstonehub-mvp` et ne rien fusionner dans `main`.
