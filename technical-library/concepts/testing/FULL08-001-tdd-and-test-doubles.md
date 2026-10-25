# FULL08-001 — Tests dirigés par les exigences et doubles de dépendances

## Identification

- **Identifiant unique :** `FULL08-001`
- **Domaine :** testing
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause, No Starch Press (2024).
- **Chapitre :** 8, *Testing with the Jest Framework*.
- **Pages physiques PDF vérifiées :** 160–169 ; 169–174 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Une modification du code peut casser un comportement existant ; les dépendances externes rendent les tests difficiles à reproduire.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre explique le cycle de test écrit avant l’implémentation, la création progressive du code pour faire passer les tests, l’utilisation de tests unitaires et la mesure de couverture. Il introduit des doubles de test (notamment stubs et fakes) pour isoler des modules dépendants.

### Interprétation et application Louvre

Définir d’abord un scénario positif, un cas limite et une erreur métier ; injecter un service factice dans le cas d’usage et réserver les tests d’intégration à la vérification des interactions réelles.

## Principe algorithmique ou architectural

Contrat comportemental → test qui échoue → implémentation minimale → vérification ; remplacement contrôlé des dépendances pendant un test unitaire.

## Conditions, limites et compromis

La couverture élevée ne prouve pas la qualité des assertions ; les doubles peuvent diverger des systèmes réels. Le livre contient des exemples Jest liés à son édition et qui ne sont pas automatiquement compatibles avec tout environnement.

## Exemple original d’application

Service fictif `calculateInvoiceTotal` : tester quantité zéro, remise valide et comportement lorsque le fournisseur de taux renvoie une erreur ; remplacer le fournisseur par une fonction de test déterministe.

## Méthode de test et validation

Dans un futur projet, exécuter réellement le runner avec les dépendances installées, documenter versions, résultats et au moins un test d’intégration pour le fournisseur externe.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Aucune exécution Jest dans ce lot ; principes vérifiés dans l’édition 2024.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.