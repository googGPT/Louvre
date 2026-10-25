# Louvre × Codex : protocole A/B n°1

**Statut : préparation reproductible des deux conditions. Aucune exécution de Codex et aucun verdict comparatif ne sont revendiqués par ce dépôt.** Issue de suivi : [#7](https://github.com/googGPT/Louvre/issues/7).

## Hypothèse et risque de biais

Tester si l'accès aux fiches Louvre peut aider un agent Codex à corriger un bug spécifique de reprise d'une réservation **après rechargement de la page**. Les deux paquets partent du **même code** figé au commit `99f8e56343a6c3c265d25a290a29ff3863d9442e`, juste après la PR #6. Les consignes fonctionnelles sont identiques (`TASK.md`). La seule différence documentaire : la condition B dispose de `technical-library/`, `AGENTS.md` et `.agents/` ; la condition A n'en dispose pas. Il s'agit d'une isolation par **snapshot de fichiers**, pas d'une impossibilité de consulter Internet ou de connaître Louvre autrement : demander explicitement à l'agent de ne pas consulter le dépôt distant et conserver les traces.

Les deux modèles/sessions doivent être indépendants, avec la même version Codex, la même limite de temps et les mêmes outils. Ne pas utiliser la sortie de A comme entrée de B. Les tests indépendants ne sont pas inclus dans les paquets donnés aux candidats.

## Génération automatique des paquets

La GitHub Action [Codex A/B snapshots](../../.github/workflows/codex-ab-snapshots.yml) exécute :

```sh
bash experiments/codex-ab-01/scripts/make-snapshots.sh
```

Les deux archives `arm-a-without-louvre.tar.gz` et `arm-b-with-louvre.tar.gz` sont publiées comme artefacts **du workflow**, avec des manifestes SHA-256 prouvant l'identité du code applicatif. Les deux archives excluent de manière identique les fichiers narratifs `labs/reservation-lab/README.md` et `labs/reservation-lab/LOUVRE-AUDIT-02.md`, qui indiqueraient d'avance les références de l'ancien audit. Le code et les tests de l'application restent identiques dans les deux conditions. `A` ne contient pas la bibliothèque, `B` la contient. Les archives ne contiennent ni les PDF originaux, ni le correcteur indépendant. Les artefacts peuvent expirer selon la configuration GitHub.

**Important :** ce workflow prépare les paquets ; il ne démarre ni Codex ni des travaux asynchrones. Il ne modifie pas `main`.

## Exécution de Codex (non encore réalisée)

Faire ouvrir chaque archive dans **une session Codex distincte** ; appliquer uniquement `TASK.md` et ne pas exposer l'évaluateur. Conserver pour chaque condition : commit/code final, journal de tests, références réellement consultées, environnement (version du modèle/outil) et ressources consommées si disponibles. Un agent peut avoir connaissance de techniques similaires de sa propre formation ; le test mesure l'effet marginal de la disponibilité de Louvre, pas l'origine réelle de toutes ses connaissances.

## Évaluation indépendante

L'évaluateur, distinct des paquets, impose un contrat minimal de logique pure pour tester expiration, validation des données, robustesse du stockage et conservation de la même clé. Une évaluation complète doit **en plus vérifier l'interface** : `sessionStorage` ne doit être lu qu'après montage React ; aucune reprise automatique ; bouton explicite utilisant l'identifiant sauvegardé.

Pour évaluer une copie locale de la solution candidate (non fournie ici) :

```sh
bash experiments/codex-ab-01/scripts/evaluate-candidate.sh /chemin/du/dossier-de-la-condition
```

La copie devra contenir `labs/reservation-lab` avec les modifications proposées. L'évaluateur ajoute temporairement un fichier de test dans la copie candidate, puis exécute les tests du domaine et la compilation ; **ne pas exécuter l'évaluateur sur les archives initiales**, qui ne sont pas censées résoudre le problème.

### Lecture des résultats

| Critère | Poids |
|---|---:|
| Pas de double réservation, mêmes identifiants, reprise volontaire | 40 |
| Tests, expiration et données corrompues | 30 |
| Respect SSR, erreurs de stockage, limites de la garantie | 20 |
| Simplicité et maintenabilité | 10 |

Ne pas inventer un score global à partir du seul résultat des tests ; les catégories nécessitent une revue du code et un scénario d'interface. Les références Louvre effectivement consultées et les coûts/temps éventuels sont comptés **séparément**. Prévoir idéalement plusieurs répétitions indépendantes pour limiter l'effet d'aléa.

## Limites de ce protocole

- Les sources PDF restent privées et ne sont pas inclues ; seules les fiches du dépôt sont dans B.
- L'idempotence serveur du démonstrateur est encore volatile et mono-processus. Les évaluations ne doivent pas affirmer de sécurité transactionnelle multi-serveurs.
- Le benchmark ne prouve pas que le modèle a « appris » les livres : il étudie seulement sa consultation éventuelle des fiches.