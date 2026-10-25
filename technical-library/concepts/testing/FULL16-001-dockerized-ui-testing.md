# FULL16-001 — Faire tourner les tests UI dans un service Docker dédié

## Identification

- **Identifiant unique :** `FULL16-001`
- **Domaine :** testing
- **Mots-clés :** Jest, snapshot tests, Docker Compose, mocks, CI, états de session
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Livre :** *The Complete Developer*, Martin Krause.
- **Chapitre :** 16, *Running Automated Tests in Docker*.
- **Pages physiques PDF retenues :** 283–287 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 283, 284, 285, 286, 287.
- **Empreinte SHA-256 du PDF source :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Reproduire localement les tests d’interface avec un environnement de dépendances stable.

## Ce qui vient du livre

Le dernier chapitre ajoute Jest au projet, définit un service de test dans Compose et teste le composant d’en-tête dans les deux états de session, connecté et non connecté, en remplaçant la session réelle par un double. L’auteur précise que cela ne couvre pas encore tous les composants, services ou API.

## Interprétation et application Louvre (originale)

Pour une interface qui varie selon les droits, tester explicitement les états authentifié/non authentifié et conserver des tests de comportement à côté des snapshots.

## Principe d'architecture et de raisonnement

Le runner de test utilise le même code source que l’application mais un environnement de test séparé. Les mocks de session doivent être réinitialisés avant chaque scénario pour supprimer les dépendances entre tests.

## Exemple original, non copié du livre

```ts
// Pseudo-test de comportement, indépendant du framework UI
const visible = (session: { userId: string } | null) => ({
  afficherConnexion: session === null,
  afficherDeconnexion: session !== null,
});

console.assert(visible(null).afficherConnexion);
console.assert(visible({ userId: "u1" }).afficherDeconnexion);
```

## Limites et compatibilité

Un snapshot peut approuver un rendu incorrect et ne garantit ni l’accessibilité ni les autorisations côté serveur. Le service Docker dépend de l’image et des commandes installées ; les tests de bout en bout restent nécessaires.

## Validation à réaliser dans un projet réel

Valider Compose, lancer les tests sous conteneur et ajouter deux tests d’intégration (session valide, session invalide) avant de qualifier le pipeline.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.