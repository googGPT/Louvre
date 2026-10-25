# Codex A/B n°1 — exécution automatisée facultative et facturable

> **État :** workflow *préparé*, jamais exécuté avec une clé API par cette livraison. Les deux bras ne produisent de solutions Codex qu'après un déclenchement manuel explicite. Une CI verte sur la PR prouve seulement les tests du mécanisme de préparation.

## Choisir la méthode

**Option gratuite / sans clé API ajoutée à GitHub :** ouvrir deux tâches Codex Cloud **indépendantes** avec les archives A et B déjà générées dans le workflow `Louvre Codex AB isolated snapshots`, lire le même `TASK.md`, puis évaluer séparément les résultats. La disponibilité de Codex Cloud dépend du compte ; les deux tâches sont à lancer dans l'interface Codex. Aucune comparaison ne peut être présumée tant que les tâches n'ont pas été exécutées.

**Option automatisée par API (facturable) :** `.github/workflows/codex-ab-run-manual.yml` utilise `openai/codex-action@v1`. Cette option nécessite une clé API OpenAI avec facturation activée, **distincte de l'abonnement ChatGPT**. Ne pas activer cette option sans avoir défini ses propres limites de dépenses dans OpenAI Platform.

## Procédure API — uniquement sur demande

1. Créer une clé API de projet dans OpenAI Platform et définir un budget/une limite de dépenses adaptés à l'expérience.
2. Sur GitHub, dans les paramètres du dépôt Louvre, ajouter une **Actions repository secret** nommée **`OPENAI_API_KEY`**. Ne jamais placer la clé dans un fichier commité, une issue, un commentaire ou la conversation.
3. Après fusion de la PR qui fournit ce workflow, ouvrir **Actions → Louvre Codex A/B agent run (manual, API charges) → Run workflow**, puis cocher **« I explicitly authorize two potentially billable Codex API runs »** et confirmer.
4. Le workflow prépare une archive identique par condition au commit figé `99f8e56343a6c3c265d25a290a29ff3863d9442e`. Il utilise deux runners indépendants. Les clés et le correcteur indépendant ne sont dans **aucun des dossiers Codex**.
5. Chaque runner Codex produit un artefact `codex-candidate-a` ou `codex-candidate-b` (patch, fichiers candidats et réponse finale). Ensuite, un job séparé exécute le correcteur indépendant. Examiner les logs, les diff et le comportement de l'interface après rafraîchissement **avant** d'attribuer un score.

Le déclenchement manuel est **désactivé par défaut** tant que la case d'autorisation n'est pas cochée ; aucun run automatique sur `push` ou `pull_request`. Le secret manque ? Le job s'arrête **avant** l'appel payant.

## Garanties et limites de l'expérience

- Les deux bras reçoivent le **même `TASK.md` et les mêmes sources applicatives**, sans les anciennes notes d'audit de l'application. Le bras B reçoit les fiches Louvre et `AGENTS.md`; A ne les reçoit pas.
- Chaque job Codex **ne fait aucun checkout du dépôt Louvre complet** : il reçoit uniquement l'archive de sa condition. Cela évite de laisser le correcteur ou la bibliothèque B à disposition du bras A dans le système de fichiers de son runner.
- Le modèle Codex utilisé par défaut dépend de la version de l'action lors de l'exécution. Les deux bras d'un même workflow utiliseront cette configuration commune ; conserver les journaux pour pouvoir interpréter les résultats. On n'a pas fixé les coûts, l'usage des tokens ni le modèle à une version garantie dans cette livraison.
- Les actions disposent de `contents: read` seulement ; elles ne poussent pas les réponses sur `main` et ne fusionnent aucune PR. Les solutions candidates peuvent être imparfaites. Le correcteur exécute du code proposé par un agent **dans un runner indépendant sans secret API**.
- La CI ne remplace pas la vérification manuelle de l'interface après rechargement, ni plusieurs répétitions indépendantes. Les résultats A/B ne sont **pas** prédéterminés.
- Les deux bras font deux appels API distincts et peuvent engendrer des coûts. Aucun plafond strict de dépense API n'est assuré par ce workflow ; il se contente de bornes de durée (`timeout-minutes`). Vérifier les limites de votre projet OpenAI.

Référence de configuration : [action officielle OpenAI Codex](https://github.com/openai/codex-action). Suivi scientifique : [Issue #7](https://github.com/googGPT/Louvre/issues/7).