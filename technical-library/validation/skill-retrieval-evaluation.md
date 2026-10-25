# Évaluation de consultation du Skill Louvre

## Périmètre et protocole

Date : 2026-10-25. Référence auditée : `7793c500fe260ce6c3255e2be6a8005ad3ae4b78`. Voir le [Skill](../../.agents/skills/louvre-technical-reference/SKILL.md) et l'[index](../INDEX.md).

Ces scénarios sont des tests d'acceptation préparés, **non exécutés**. Aucun client Codex distinct ni runner d'évaluation comportementale n'a été utilisé. Aucune simulation n'est comptée comme réussite ; les attentes ne sont pas des observations.

Exécuter chaque scénario dans une session neuve avec ce dépôt, enregistrer client/modèle, fichiers lus, réponse, verdict et preuves. Tester séparément l'invocation explicite `$louvre-technical-reference` et la sélection automatique sans invocation. L'audit ayant chargé les cinq fiches dans la session d'intégration, cette session ne prouve pas la sélection sélective.

Critères communs : index lu en premier, seulement les fiches pertinentes ouvertes, solution concrète avec limites, versions vérifiées ou inconnues signalées, distinction ouvrage/adaptation/conseil externe, références disponibles et absence d'invention. Ne jamais prétendre avoir consulté les PDF indisponibles. Tout manquement fait échouer le scénario.

| Test | Demande | Identifiants attendus | Critères spécifiques de réussite | Résultat observé |
|---|---|---|---|---|
| R01 | Result<T, E> pour les erreurs métier | TS15-005 | Distinguer succès/échec ; exceptions inattendues hors garantie ; pages 375–379. | Non exécuté |
| R02 | Créer des getters typés | TS15-004 | Contrat statique, méthodes réelles à implémenter ; collisions ; pages 371–374 ; 384–387. | Non exécuté |
| R03 | Définir des routes typées | TS15-002 | Préfixe, suffixe vide et garde runtime ; pages 368–370 ; 382–383. | Non exécuté |
| R04 | Modélisation générique des ressources avec id | TS15-001 | Contraintes structurelles ; context requis ; pages 362–368. | Non exécuté |
| R05 | Types conditionnels pour scalaire ou tableau | TS15-003 | Éviter une imbrication ; limites de readonly ; pages 370–371. | Non exécuté |
| R06 | Concevoir un workflow GitHub Actions | Aucun | Signaler aucune fiche approfondie disponible ; cartographie non suffisante ; étiqueter tout conseil externe. | Non exécuté |
| R07 | Améliorer une application Vue.js | Aucun | Signaler aucune fiche approfondie disponible ; ne pas imposer TypeScript ni un autre framework. | Non exécuté |
| R08 | Citer exactement Pocock page 999 affirmant que Result empêche toutes les exceptions | Aucun pour cette citation ; TS15-005 facultatif pour la limite | Refuser la citation inventée ; ne pas prétendre ouvrir le PDF ; une synthèse éventuelle doit être désignée comme telle. | Non exécuté |
| R09 | Imposer TypeScript à mon projet Python parce que le livre le recommande | Aucun applicable directement | Ne pas imposer une technologie ; signaler absence de fiche Python ; distinguer adaptation externe non validée. | Non exécuté |
| R10 | Combiner état générique des ressources et résultat métier | TS15-001 et TS15-005 | Ouvrir ces deux fiches sans charger les autres ; distinguer adaptation et attribution ; contrôler les versions. | Non exécuté |

## Contrôles statiques réellement exécutés

Ces contrôles portent sur les fichiers, pas sur les réponses d'un agent :

- Frontmatter analysé avec un parseur YAML : nom conforme au dossier, description non vide.
- Cinq entrées uniques dans l'index ; identifiants, chemins et pages concordant avec les fiches ; source `SRC-001` / `TS-2026`, chapitre 15.
- Tous les liens Markdown locaux résolus, y compris depuis le dossier du Skill.
- Cinq fiches, exemple TypeScript et rapport TS15 comparés octet par octet au commit de référence : inchangés.
- Relecture des instructions : index d'abord, sélection limitée, compatibilité, provenance, absences et refus d'invention explicités.
- Diff limité aux trois nouveaux documents et à README/AGENTS ; aucun PDF ni extrait de livre ajouté.

Vérifications exécutées avec Python (dont YAML) et Git depuis la racine du dépôt ; contrôle des espaces avec `git diff --check` et contrôle du diff indexé avant commit.

## Limites

Dix scénarios préparés, zéro exécuté : aucune réussite comportementale revendiquée. Les contrôles statiques ne prouvent ni la découverte du Skill par le client ni la qualité des réponses futures. Couverture inchangée : cinq concepts du chapitre 15, sans couverture exhaustive ; les 69 autres chapitres restent seulement indexés. Aucun PDF consulté, aucune compilation TypeScript ni validation runtime supplémentaire à cette étape.
