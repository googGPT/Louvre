# VUE05-001 — État partagé avec Pinia et valeurs calculées

## Identification

- **Identifiant unique :** `VUE05-001`
- **Domaine :** frontend
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten, Packt Publishing (2024).
- **Chapitre :** 5, *Building a Recipe App with Vuetify*.
- **Pages physiques PDF vérifiées :** 133–144 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Plusieurs composants Vue doivent manipuler le même panier ou planning sans dupliquer leurs règles de mise à jour.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Dans le projet de recettes, l’ouvrage présente le rôle de Pinia comme gestionnaire d’état centralisé, l’ajout de stores, un store de planification et des valeurs calculées exposées à partir de cet état. Les exemples font partie d’une application Vue/Vuetify précise.

### Interprétation et application Louvre

Pour un système fictif d’inscription à des ateliers, définir un store par domaine partagé avec état minimal, actions explicites et dérivations calculées ; éviter de tout placer dans un store global.

## Principe algorithmique ou architectural

État partagé exposé aux composants ; actions déclenchent des changements ; calculs dérivés évitent de répliquer une valeur calculable.

## Conditions, limites et compromis

L’état Pinia côté client n’est pas une source d’autorité pour les permissions ou l’inventaire ; synchronisation serveur et persistance demandent des mécanismes distincts.

## Exemple original d’application

Store « sélection d’ateliers » avec IDs sélectionnés et compteur dérivé ; vérifier qu’un composant modifiant la sélection met à jour les autres, sans considérer le client comme autorité métier.

## Méthode de test et validation

Dans une application Vue 3 réelle, tester actions, getters, montages/démontages et décalages entre état local et serveur.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Livre Vue.js 3 (2024). Aucune installation de Vue, Pinia ou Vuetify dans cet environnement.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.