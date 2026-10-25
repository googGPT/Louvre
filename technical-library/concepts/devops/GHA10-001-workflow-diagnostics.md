# GHA10-001 — Diagnostiquer un workflow sans divulguer de secrets

## Identification

- **Identifiant unique :** `GHA10-001`
- **Domaine :** devops
- **Mots-clés :** GitHub Actions, diagnostics, logs, badges, re-run, debug, artefacts
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Livre :** *Learning GitHub Actions*, Brent Laster.
- **Chapitre :** 10, *Monitoring, Logging, and Debugging*.
- **Pages physiques PDF retenues :** 245–268 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 245, 248, 254, 255, 259, 263, 268.
- **Empreinte SHA-256 du PDF source :** `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Trouver pourquoi un pipeline échoue sans relancer à l’aveugle et sans exposer de secrets.

## Ce qui vient du livre

Le chapitre présente la liste et les filtres de workflows, les badges de statut, la relation d’une exécution avec le fichier de workflow de son commit, les relances ciblées, les logs détaillés et les diagnostics supplémentaires du runner.

## Interprétation et application Louvre (originale)

Pour Louvre, sur un échec de validation, consulter d’abord l’exécution liée au SHA exact, lire la première erreur exploitable, reproduire localement le validateur, puis appliquer une correction minimale.

## Principe d'architecture et de raisonnement

Trier les problèmes selon leur origine : checkout, outil, fichier source, dépendances ou permission. Les journaux de débogage et les artefacts ne doivent pas embarquer des données sensibles.

## Exemple original, non copié du livre

```text
# Checklist originale de dépannage CI
# 1. Identifier commit SHA et nom du workflow en échec
# 2. Identifier le premier job et l’étape en échec
# 3. Reproduire la commande en environnement propre
# 4. Vérifier diff, droits et valeurs de configuration
# 5. Corriger puis vérifier une nouvelle exécution ; ne pas déclarer
#    le pipeline réussi sur la seule base d’une relance manuelle.
```

## Limites et compatibilité

Les paramètres de logs avancés et les options de re-run dépendent des droits et des versions de GitHub. Le débogage verbeux peut dévoiler des données malgré le masquage de secrets : revoir le contenu des logs.

## Validation à réaliser dans un projet réel

Introduire une erreur documentaire sur branche de test, relever les logs, restaurer la bonne référence, et constater le retour au vert sur le commit corrigé.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.