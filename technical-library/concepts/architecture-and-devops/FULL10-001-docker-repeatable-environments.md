# FULL10-001 — Construire des environnements reproductibles avec Docker

## Identification

- **Identifiant unique :** `FULL10-001`
- **Domaine :** architecture-and-devops
- **Mots-clés :** Docker, Dockerfile, Compose, reproductibilité, isolation, services
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Livre :** *The Complete Developer*, Martin Krause.
- **Chapitre :** 10, *Containerization with Docker*.
- **Pages physiques PDF retenues :** 203–211 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 203, 204, 205, 206, 207, 209, 210, 211.
- **Empreinte SHA-256 du PDF source :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Éviter qu’une application fonctionne sur une machine mais pas sur une autre.

## Ce qui vient du livre

Le chapitre distingue images et conteneurs, introduit le Dockerfile, la construction et le lancement d’une image, puis l’orchestration de services via Docker Compose. Il illustre l’exécution de l’application et de Jest comme services séparés.

## Interprétation et application Louvre (originale)

Décrire un déploiement web avec un conteneur applicatif, un environnement de test isolé et des paramètres fournis à l’exécution. Choisir des images de base explicitement versionnées et réduire les privilèges.

## Principe d'architecture et de raisonnement

Construire l’image de façon déterministe, séparer build et exécution, ne jamais inclure les secrets dans l’image ; relier les services avec des noms de service plutôt que localhost entre conteneurs.

## Exemple original, non copié du livre

```text
# Exemple conceptuel — docker-compose.yml
services:
  web:
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
  tests:
    build: .
    command: ["npm", "test", "--", "--runInBand"]
    profiles: ["test"]
```

## Limites et compatibilité

Exemple Compose incomplet sans Dockerfile/package.json ; aucune image réelle n’a été construite ici. Les recommandations de syntaxe et de sécurité doivent être comparées à la documentation Docker actuelle. Exposer un port sur toutes les interfaces exige une justification.

## Validation à réaliser dans un projet réel

Avec Docker installé, valider `docker compose config`, exécuter le build, vérifier la connectivité puis l’isolation et le fonctionnement du profil de test.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.