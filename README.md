# Louvre — Bibliothèque de connaissances techniques

Louvre a pour objectif de constituer une bibliothèque de connaissances techniques que Codex pourra consulter pour développer des applications Web, mobiles et des logiciels. Elle vise des solutions traçables, maintenables, testables et sûres.

## État actuel

L'étape 1 a initialisé la structure documentaire et le catalogue de cinq ouvrages. L'étape 2 intègre cinq cartographies documentaires fournies par l'utilisateur, totalisant 70 chapitres. L'étape 3A ajoute cinq fiches pilotes issues de `TS-2026` (`SRC-001`), chapitre 15, avec un exemple TypeScript et un rapport de validation. La consultation du PDF et le succès statique sous TypeScript 5.8.3 sont rapportés par l'environnement source ChatGPT ; ils n'ont pas été reproduits dans Codex, où le PDF et `tsc` ne sont pas disponibles. Les informations bibliographiques du catalogue proviennent de la demande utilisateur et n'ont pas été vérifiées dans les ouvrages.

Les cinq PDF ont été fournis dans une autre conversation ChatGPT. Leur accès dans cette conversation ou cet environnement n'est pas établi. Leur présence ailleurs ne permet pas de prétendre les avoir consultés ici.

La couverture reste limitée à cinq concepts du chapitre 15, sans couverture exhaustive de ce chapitre. Les 69 autres chapitres restent uniquement indexés. Aucun autre chapitre ni autre ouvrage n'a été extrait dans ce pilote. Voir le [pilote et ses cinq fiches](README-PILOT.md).

## Consultation avec Codex

Le Skill [louvre-technical-reference](.agents/skills/louvre-technical-reference/SKILL.md) est fourni au format Agent Skills du dépôt. Dans un client Codex qui découvre ces Skills, invoquer `$louvre-technical-reference` avec le problème à résoudre, ou laisser le client sélectionner le Skill selon sa description. Si le client ne le découvre pas, demander explicitement de lire ce fichier puis de suivre son protocole.

Le Skill lit d'abord [INDEX.md](technical-library/INDEX.md), puis uniquement les fiches pertinentes. Il distingue les références des ouvrages, les adaptations Louvre et les conseils externes, vérifie l'applicabilité au projet et signale les connaissances absentes. Il ne constitue ni un moteur RAG ni une validation des PDF. L'activation automatique dépend du client et n'a pas été testée ici ; voir l'[évaluation](technical-library/validation/skill-retrieval-evaluation.md).

## Organisation et fonctionnement

- [AGENTS.md](AGENTS.md) définit les règles de travail de Codex.
- [technical-library/SOURCES.md](technical-library/SOURCES.md) répertorie les ouvrages, leur accessibilité et leur état d'analyse.
- [technical-library/source-maps/README.md](technical-library/source-maps/README.md) présente les cartographies importées et les limites de leur vérification.
- [technical-library/KNOWLEDGE-TEMPLATE.md](technical-library/KNOWLEDGE-TEMPLATE.md) fournit le modèle des futures fiches techniques.

Chaque future fiche devra relier ses affirmations à une source et à une référence vérifiée, distinguer les faits, les interprétations et les recommandations, puis documenter les limites, la compatibilité et la validation de la technique. Les PDF et les longs extraits protégés ne doivent pas être publiés dans le dépôt.

## Travaux restant à réaliser — hors du pilote

1. Établir l'accès effectif aux ouvrages et vérifier leurs métadonnées bibliographiques.
2. Sur instruction explicite, analyser les contenus accessibles et rédiger des fiches à partir du modèle, avec références exactes.
3. Valider les exemples originaux, les tests et la compatibilité avec les versions logicielles retenues.
4. Organiser et enrichir progressivement la bibliothèque pour les usages Web, mobiles et logiciels, en signalant les domaines encore non couverts.

L'initialisation est réalisée sur `codex/louvre-knowledge-library`, créée depuis la branche `main` actuelle. Elle ne réutilise pas l'ancien projet CapstoneHub. Aucune fusion dans `main` n'est prévue à cette étape.
