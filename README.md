# Louvre — Bibliothèque de connaissances techniques

Louvre a pour objectif de constituer une bibliothèque de connaissances techniques que Codex pourra consulter pour développer des applications Web, mobiles et des logiciels. Elle vise des solutions traçables, maintenables, testables et sûres.

## État actuel

L'étape 1 a initialisé la structure documentaire et le catalogue de cinq ouvrages. L'étape 2 intègre cinq cartographies documentaires fournies par l'utilisateur, totalisant 70 chapitres. Aucune extraction approfondie ni validation de code issu des livres n'a été réalisée. Les informations bibliographiques du catalogue proviennent de la demande utilisateur et n'ont pas été vérifiées dans les ouvrages.

Les cinq PDF ont été fournis dans une autre conversation ChatGPT. Leur accès dans cette conversation ou cet environnement n'est pas établi. Leur présence ailleurs ne permet pas de prétendre les avoir consultés ici.

## Organisation et fonctionnement

- [AGENTS.md](AGENTS.md) définit les règles de travail de Codex.
- [technical-library/SOURCES.md](technical-library/SOURCES.md) répertorie les ouvrages, leur accessibilité et leur état d'analyse.
- [technical-library/source-maps/README.md](technical-library/source-maps/README.md) présente les cartographies importées et les limites de leur vérification.
- [technical-library/KNOWLEDGE-TEMPLATE.md](technical-library/KNOWLEDGE-TEMPLATE.md) fournit le modèle des futures fiches techniques.

Chaque future fiche devra relier ses affirmations à une source et à une référence vérifiée, distinguer les faits, les interprétations et les recommandations, puis documenter les limites, la compatibilité et la validation de la technique. Les PDF et les longs extraits protégés ne doivent pas être publiés dans le dépôt.

## Futures étapes — non exécutées

1. Établir l'accès effectif aux ouvrages et vérifier leurs métadonnées bibliographiques.
2. Sur instruction explicite, analyser les contenus accessibles et rédiger des fiches à partir du modèle, avec références exactes.
3. Valider les exemples originaux, les tests et la compatibilité avec les versions logicielles retenues.
4. Organiser et enrichir progressivement la bibliothèque pour les usages Web, mobiles et logiciels, en signalant les domaines encore non couverts.

L'initialisation est réalisée sur `codex/louvre-knowledge-library`, créée depuis la branche `main` actuelle. Elle ne réutilise pas l'ancien projet CapstoneHub. Aucune fusion dans `main` n'est prévue à cette étape.
