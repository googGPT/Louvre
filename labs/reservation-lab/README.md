# Louvre Engineering Lab 01 — Réservation d'ateliers

**Objectif :** première démonstration *exécutable* reliant les fiches Louvre à une application Web Next.js, sans prétendre qu'une source bibliographique décrit cette application.

## Démarrer

Prérequis : Node.js 22+, accès à npm. Depuis `labs/reservation-lab/` :

```bash
npm install
npm run test:domain
npm run dev
# Ouvrir http://localhost:3000
```

`npm run build && npm start` pour le mode production **local de démonstration**. Aucun hébergement public n'est configuré. Le rapport de CI de la PR distingue les tests exécutés des composants non testés.

## Fonctionnalités

- Voir trois ateliers fictifs et leurs places restantes (`GET /api/workshops`).
- Réserver 1 à 4 places avec contrôle des entrées JSON (`POST /api/reservations`).
- Retourner une union discriminée `Result<T,E>` dans le cœur métier, distinguer `FULL` (HTTP 409) des erreurs de données (HTTP 400).
- Éviter les réservations en double pour **une même clé d'idempotence**, uniquement pendant la vie du processus.
- Décrémenter les places sans `await` entre contrôle et écriture **dans une seule instance Node.js**.
- Aucun nom, email ou paiement n'est collecté ; la démonstration n'authentifie aucun utilisateur.

### Exemple d'API

`GET /api/workshops` renvoie `{ workshops, mode }`.

`POST /api/reservations` :

```json
{"workshopId":"typescript-clinic","quantity":2,"requestId":"550e8400-e29b-41d4-a716-446655440000"}
```

Réponse `201` : `{ "reservationId": "DEMO-00001", "workshopId": "typescript-clinic", "quantity": 2, "remaining": 2 }`.

## Limites essentielles

**Ne pas utiliser ce projet pour de vraies réservations.** Les données sont en mémoire dans un objet global au seul processus serveur : un redémarrage efface les réservations ; deux serveurs peuvent vendre les mêmes places. Ni base persistante, ni transactions SQL, ni authentification, ni contrôle de propriété, ni annulation, ni limitation de débit, ni contrôle de fraude. Les tests de concurrence n'établissent la sécurité que pour **un seul processus Node.js**. Aucune garantie de disponibilité externe.

Pour une vraie application : base SQL et transaction atomique `UPDATE ... WHERE remaining >= quantity`, clé d'idempotence unique persistante, identité serveur et autorisations, tests multi-instances, limites de requêtes, observabilité et migration.

## Traçabilité Louvre

| Élément du démonstrateur | Fiche consultée sur `main` | Application (création originale Louvre) |
|---|---|---|
| Résultats métier | [`TS15-005`](../../technical-library/concepts/language-and-types/TS15-005-result-errors.md), *Total TypeScript* ch.15 PDF pp.375–379 | `Result<Booking, BookingError>` et statut API |
| Validation runtime et routes | [`NEXT04-001`](../../technical-library/concepts/backend-and-apis/NEXT04-001-api-route-validation.md), *Ultimate Next.js* ch.4 | `app/api/.../route.ts` avec validation stricte et taille maximale |
| Séparation état UI / serveur | [`NEXT08-001`](../../technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md), *Ultimate Next.js* ch.8 | État UI local et inventaire contrôlé par le serveur |
| Architecture services | [`FULL11-001`](../../technical-library/concepts/architecture-and-devops/FULL11-001-compose-service-topology.md), *The Complete Developer* ch.11 | Couche domaine isolée ; limites du store mono-processus explicites |
| CI et gestion des tests | [`GHA12-001`](../../technical-library/concepts/devops/GHA12-001-reusable-workflows.md), *Learning GitHub Actions* ch.12 | Workflow dédié pour compiler, tester et construire l'app |
| Variante Vue | [`VUE05-001`](../../technical-library/concepts/frontend/VUE05-001-pinia-state.md), *Building Real-World Web Applications with Vue.js 3* ch.5 | Technique alternative identifiée, sans mélanger Vue et React dans ce MVP |

Les ouvrages apportent des **principes techniques**, pas le code de cette application ; le choix du store en mémoire, des ateliers, de l'UI et des endpoints appartient à l'adaptation originale Louvre.

## Tests et critères

Tests `node:test` : inventaire initial, réservation, solde, épuisement, idempotence, conflit de clé, concurrence dans un seul processus, atelier inconnu, quantités invalides, validation runtime, rejet d'un `userId` usurpé et protection de la réponse stockée contre les mutations. GitHub Actions exécute les tests du domaine, une compilation Next.js et un test HTTP sur le serveur démarré localement (page, routes, validation, idempotence et concurrence dans un seul processus).

**Critères non satisfaits pour un produit réel** (voir [`playbook`](../../technical-library/playbooks/reservation-system-cross-book.md)) : annulation réservée au propriétaire, persistance après redémarrage, transaction inter-processus et identité authentifiée.