# Instructions pour les agents (Codex, Claude et autres)

Ces règles s'appliquent à l'ensemble du dépôt, aux applications et à toutes les futures fiches techniques, quel que soit l'agent.

## Applications (`apps/`)

- La liste des applis publiées est `apps/catalogue.json` ; toute nouvelle appli y est ajoutée.
- Ne jamais écrire `sw.js` à la main : lancer `python scripts/build_sw.py` après toute modification d'une appli (le nom du cache suit le contenu ; sinon les visiteurs gardent l'ancienne version).
- Lancer `python scripts/apply_csp.py` après toute modification d'un `index.html` ; garder `index.htm` identique à `index.html`.
- Aucune ressource externe (script, police, image, API) : la CSP l'interdit et les applis doivent fonctionner hors ligne.
- Montants en centimes entiers ; dates en jours civils ; sauvegardes validées avant écriture ; mode protégé conservé si une restauration échoue.
- Avant toute PR : `bash scripts/test_app.sh <slug>` pour chaque appli touchée, puis `bash scripts/build_site.sh`.
- Une appli sans vraie logique métier (simple formulaire générique) ne doit pas être publiée.
- Applis multilingues : aucun texte d'interface en dur ; tout passe par `messages.js` (7 langues complètes, vérifiées par `scripts/check_messages.cjs`), les montants par `LouvreI18n.money` (devise choisie) et les dates par `LouvreI18n.date`. Ne jamais modifier les copies `louvre-i18n.*` dans une appli : modifier `shared/` puis lancer `scripts/sync_shared.py`.

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
- Respecter le périmètre de la mission autorisée. Travailler sur la branche dédiée, ne pas réutiliser `codex/capstonehub-mvp` et ne rien fusionner dans `main` sans instruction explicite.

## Consultation des connaissances

Pour une demande technique susceptible de bénéficier de Louvre, utiliser le Skill [louvre-technical-reference](.agents/skills/louvre-technical-reference/SKILL.md) : lire d'abord l'[index](technical-library/INDEX.md), puis uniquement les fiches pertinentes. Ne pas charger toute la bibliothèque à chaque tâche. Signaler les domaines non couverts et préserver la distinction entre validations source rapportées et contrôles effectivement exécutés.
