# Parcours d’ingénierie Louvre : concevoir un service de réservation

> **Nature du livrable :** scénario d’architecture original, non exécutable, qui compose des fiches de plusieurs livres. Il ne prétend pas être décrit comme tel par un auteur. **Aucune application n'est déployée** par ce guide.

## Contexte

Un site propose des ateliers à capacité limitée. On veut afficher les places, réserver une ou plusieurs places, annuler et retrouver son historique. Ce scénario sert de test de consultation croisée des références.

## Comment mobiliser les connaissances

1. **Contrats TypeScript** : utiliser la fiche [TS15-005](../concepts/language-and-types/TS15-005-result-errors.md) pour un résultat de réservation typé (`SUCCESS`, `FULL`, `INVALID_QUANTITY`) ; [TS12-001](../concepts/language-and-types/TS12-001-callback-assignability.md) précise les contrats des callbacks de notification. Éviter de confondre typage et validation des requêtes.
2. **Identité et autorisation** : [FULL15-001](../concepts/security/FULL15-001-oauth-session-graphql-guard.md) distingue la session connectée d'un contrôle de propriété au niveau de chaque mutation. La présence d'un bouton « réserver » n'est jamais un garde serveur.
3. **État d'interface** : [NEXT08-001](../concepts/frontend/NEXT08-001-client-vs-server-state.md) sépare état des filtres, état partagé et lecture de la disponibilité sur le serveur ; [VUE05-002](../concepts/frontend/VUE05-002-vuetify-dialog-events.md) donne un exemple alternatif pour des composants Vue, sans imposer Vue et Next.js dans la même interface.
4. **Services et données** : [FULL11-001](../concepts/architecture-and-devops/FULL11-001-compose-service-topology.md) décrit l'environnement de développement multi-services. Pour réserver de façon fiable, la mise à jour de la capacité doit être **atomique côté base**, et non calculée uniquement dans le navigateur ou la mémoire de chaque conteneur.
5. **CI et contrôles** : [GHA12-001](../concepts/devops/GHA12-001-reusable-workflows.md) permet un workflow de validation partagé ; [GHA13-001](../concepts/devops/GHA13-001-job-matrix-design.md) décline les tests sur plusieurs versions si ce besoin existe.

## Contrat d'API proposé (création Louvre)

- `POST /reservations` reçoit `{ workshopId: string, quantity: number }` validé à l'exécution.
- Le serveur dérive `userId` de la session vérifiée, pas du corps de la requête.
- L'écriture ne valide une réservation que si `available >= quantity` **dans la même opération transactionnelle/conditionnelle que la décrémentation**.
- Une clé d'idempotence évite la duplication d'une commande lorsqu'un client réessaie après une coupure réseau.
- Les erreurs métier prévues ont un contrat typé, mais les erreurs d'infrastructure restent journalisées et peuvent demander une stratégie de reprise.

## Épreuves d'acceptation à écrire avant de déclarer l'app fonctionnelle

- Deux personnes tentent de réserver la dernière place simultanément : une seule réservation réussit.
- Un utilisateur tente d'annuler la réservation d'un tiers : refus.
- Une requête JSON inconnue ou invalide est refusée même si son client utilise TypeScript.
- Le même identifiant d'idempotence rejoué ne crée pas deux réservations.
- Un redémarrage des conteneurs n'efface pas les données persistantes.
- Les tests CI distinguent l'environnement de documentation (présent) des tests de l'application (à créer).

## Non-décisions

Ce guide ne choisit ni hébergeur, ni framework, ni base finale et n'affirme pas que les extraits des livres suffisent à résoudre la concurrence transactionnelle. Le schéma et les exigences ci-dessus sont **des adaptations originales Louvre** ; les liens permettent à Codex de consulter chaque fiche plutôt que d'inventer une attribution bibliographique.