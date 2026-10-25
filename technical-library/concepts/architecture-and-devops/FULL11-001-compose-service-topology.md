# FULL11-001 — Orchestration des services de développement avec Docker Compose

## Identification

- **Identifiant unique :** `FULL11-001`
- **Domaine :** architecture-and-devops
- **Mots-clés :** Docker Compose, volumes, services, MongoDB, base de développement, variables environnement
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-002` / `FULL-2024`.
- **Ouvrage :** *The Complete Developer*, Martin Krause (2024).
- **Chapitre :** 11, *Setting Up the Docker Environment*.
- **Pages physiques PDF analysées :** 216–223 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 216, 217, 218, 219, 220, 221, 222, 223.
- **SHA-256 du PDF source privé :** `39c66b7952442c40fd2658738f342ff9b1bacb9f2a7230433e40837e1cf40c0d`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Le frontend, l’API et MongoDB fonctionnent chacun sur la machine du développeur mais se connectent mal entre eux ou perdent leurs données.

## Ce que le livre établit sur les pages indiquées

L’auteur configure une application Food Finder avec MongoDB, un service applicatif, un frontend, des variables d’environnement, un script d’initialisation et un volume persistant. L’exemple construit une URL MongoDB à partir du nom de service Compose et du port du conteneur.

## Interprétation et décision d'ingénierie Louvre

Décrire explicitement les services, dépendances, volumes et noms DNS internes. Garder les secrets hors des fichiers versionnés. Les ports exposés à l’hôte servent au besoin local ; la communication inter-conteneurs peut utiliser le réseau Compose sans exposition inutile.

## Exemple original (pas un extrait du livre)

```yaml
# Proposition Louvre, non exécutée : configuration illustrative.
services:
  db:
    image: mongo:7 # Exemple de version : à valider et épingler.
    volumes:
      - louvre-data:/data/db
  api:
    build: ./api
    environment:
      MONGO_URL: mongodb://db:27017/louvre
    depends_on:
      - db
volumes:
  louvre-data:
```

## Limites et conditions d'usage

`depends_on` ordonne le démarrage mais ne garantit pas que MongoDB soit prêt ; ajouter un healthcheck et une stratégie de reconnexion. L’image `mongo:7` est ici indicative, pas vérifiée en production. Ne pas exposer les ports de MongoDB publiquement ni stocker de vrais identifiants dans le dépôt.

## Vérification exigée dans un projet réel

En présence de Docker, exécuter `docker compose config`, démarrer les services isolés et vérifier un accès DNS interne `db`, la persistance et le comportement de démarrage retardé.

## Connexions avec les autres fiches

- Fiche antérieure : `FULL10-001-docker-repeatable-environments.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.