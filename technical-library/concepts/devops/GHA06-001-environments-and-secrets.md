# GHA06-001 — Isoler variables, secrets et approbations par environnement GitHub

## Identification

- **Identifiant unique :** `GHA06-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, environment, vars, secrets, approvals, GITHUB_TOKEN
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster.
- **Chapitre :** 6, *Managing Your Workflow Environments*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 113, 115, 118, 121, 125, 126, 128, 132, 134, 137.
- **SHA-256 du PDF privé :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Un workflow traite des secrets de production comme de simples variables de configuration, ou permet à toutes les branches de déployer.

## Faits explicitement documentés par l'ouvrage

Le chapitre distingue contextes, variables d’environnement, variables de configuration, secrets et `GITHUB_TOKEN`. Il présente les environnements de déploiement GitHub, leurs secrets propres et les règles d’approbation avant exécution.

## Interprétation / adaptation Louvre

Créer `staging` et `production` avec secrets séparés. Restreindre les permissions du jeton au strict nécessaire ; rendre la publication dépendante d’une approbation appropriée ; vérifier aussi les protections de branche.

## Stratégie algorithmique ou architecturale

PR → vérification sans secrets privilégiés ; push de branche protégée → build → job en environnement `production` → approbation → injection des secrets uniquement dans le job autorisé.

## Exemple original (non recopié de l'ouvrage)

```yaml
# Exemple partiel (pas un workflow autonome)
jobs:
  publish:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
    steps:
      - run: echo "Deployment job gated by environment rules"
```

L’approbation exige que l’environnement soit configuré séparément dans GitHub.

## Limites, sécurité et compatibilité

Les secrets ne sont pas disponibles de la même façon pour les PR externes et selon l’événement. Les règles d’environnement dépendent des paramètres et de l’offre GitHub. Le `echo` ne déploie rien ; ne pas confondre cet exemple avec un pipeline sécurisé complet.

## Validation / tests

Contrôler les paramètres de protection de `production`, le champ `permissions`, le refus sans approbation et l’absence de secrets dans les logs. Aucun environnement GitHub réel n’a été configuré ici.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.