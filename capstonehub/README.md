# CapstoneHub — noyau métier

CapstoneHub est une application de suivi de projets de fin d’études en binômes : projets, rôles, jalons et livrables.

## Première étape livrée

Ce dépôt commence par un noyau métier Elixir, sans interface ni persistance. Il formalise les règles de domaine avant d’ajouter Phoenix LiveView et PostgreSQL. Cette première version ne doit pas être exposée comme application de production : l’authentification, l’autorisation et le stockage durable restent à construire.

## Architecture cible

- **Domaine Elixir pur** : règles et transitions testables sans dépendance à l’interface.
- **Phoenix LiveView** : interface interactive côté serveur.
- **Ecto + PostgreSQL** : persistance relationnelle et migrations.
- **Authentification et autorisation** : comptes, rôles enseignant/étudiant et accès par projet avant toute mise en production.

## Notions du livre mobilisées

Le noyau organise le domaine autour de données explicites, de fonctions pures, de validations composables et d’erreurs représentées dans les valeurs de retour. Les chapitres ultérieurs guideront l’ajout des protocoles, de l’agrégation et des effets contrôlés. Le code applicatif utilisera les abstractions standard de l’écosystème quand elles sont plus adaptées qu’une réimplémentation pédagogique.

## Démarrage du noyau

Prérequis : Elixir 1.17 ou ultérieur.

```sh
cd capstonehub
mix compile
```

Aucune compilation ni aucun test n’a été exécuté dans cet environnement.

## État et suite

Voir [docs/ROADMAP.md](docs/ROADMAP.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et [docs/BOOK-CONCEPTS.md](docs/BOOK-CONCEPTS.md).
