# NEXT12-001 — Réécritures de routes, locales et limites du runtime Edge

## Identification

- **Identifiant unique :** `NEXT12-001`
- **Domaine :** frontend
- **Mots-clés :** Next.js, middleware, rewrite, locale, edge runtime, matcher, internationalisation
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain (2026).
- **Chapitre :** 12, *Advanced Features in Next.js*.
- **Pages physiques PDF analysées :** 287–290, 295–304 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 287, 288, 289, 290, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304.
- **SHA-256 du PDF source privé :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Un site multilingue veut rediriger les utilisateurs et filtrer certaines routes, sans confondre routage et sécurité métier.

## Ce que le livre établit sur les pages indiquées

Le chapitre 12 aborde la logique de middleware, les redirections, réécritures, en-têtes et `matcher`, puis le routage internationalisé et les contraintes du runtime Edge. Il oppose les opérations légères compatibles Edge aux fonctionnalités nécessitant des API Node plus étendues.

## Interprétation et décision d'ingénierie Louvre

Utiliser les contrôles de pré-routage pour adapter l’URL ou la locale ; conserver l’autorisation sensible au niveau de l’action/route serveur et de la donnée. Définir explicitement le comportement si la locale est absente ou invalide.

## Exemple original (pas un extrait du livre)

```ts
// Pseudo-code de décision indépendant d'une version Next.js.
export function chooseLocale(path: string, preferred: string): string {
  const supported = new Set(["fr", "en", "es"]);
  const locale = supported.has(preferred) ? preferred : "fr";
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}
// L'intégration middleware/Proxy doit être adaptée à la version ciblée.
```

## Limites et conditions d'usage

Le livre décrit Next.js 15 ; noms et modalités de middleware, Proxy, App Router, i18n et Edge ont pu évoluer. Ne pas présenter ce pseudo-code comme une API officielle actuelle ni comme un mécanisme d’authentification. Vérifier les boucles de redirection et règles de cache.

## Vérification exigée dans un projet réel

Tester GET `/`, `/fr`, `/en/page`, locale non supportée, requêtes API et assets, risques de boucle, latence et cache/CDN selon la version utilisée.

## Connexions avec les autres fiches

- Fiche antérieure : `NEXT05-001-authorization-server-checks.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.