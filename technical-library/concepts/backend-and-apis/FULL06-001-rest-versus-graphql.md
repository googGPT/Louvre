# FULL06-001 — Choisir entre API REST et GraphQL selon les échanges

## Identification

- **Identifiant unique :** `FULL06-001`
- **Domaine :** backend and apis
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause, No Starch Press (2024).
- **Chapitre :** 6, *Rest and GraphQL APIs*.
- **Pages physiques PDF vérifiées :** 124–125 ; 131–138 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Une application doit exposer des ressources et servir plusieurs clients ayant des besoins de données différents.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre décrit REST comme un style d’API centré sur des ressources et des méthodes HTTP ; il présente les schémas, requêtes et résolveurs GraphQL. La comparaison met en avant le sur-chargement et le sous-chargement des réponses REST lorsque le client cherche précisément certains champs ou doit agréger plusieurs ressources.

### Interprétation et application Louvre

Privilégier un contrat REST simple pour des ressources et opérations stables ; évaluer GraphQL si les clients ont des projections variées nécessitant de nombreuses combinaisons de champs. Cette règle de décision est une synthèse Louvre, pas une prescription universelle de l’auteur.

## Principe algorithmique ou architectural

REST : URL/méthode HTTP et représentation de ressource ; GraphQL : schéma typé et sélection des champs/résolveurs côté serveur.

## Conditions, limites et compromis

GraphQL n’élimine ni le besoin d’autorisation par champ, ni la complexité des résolveurs, ni les coûts de requêtes. REST peut proposer des paramètres de projection et agrégation. Aucun benchmark des deux solutions n’a été exécuté.

## Exemple original d’application

Projet fictif « catalogue de cours » : REST `GET /courses/:id` pour une fiche stable ; envisager GraphQL quand trois interfaces ont besoin de sous-ensembles distincts (titre, disponibilité, enseignant).

## Méthode de test et validation

Vérifier contrats, erreurs et autorisations sur chaque ressource/champ ; mesurer latence, nombre de requêtes et charge sur un prototype comparable.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Principes du livre 2024 ; aucune version d’Apollo, GraphQL ou framework installée ou testée.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.