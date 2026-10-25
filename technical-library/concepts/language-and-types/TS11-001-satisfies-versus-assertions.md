# TS11-001 — Préférer satisfies aux assertions de type injustifiées

## Identification

- **Identifiant unique :** `TS11-001`
- **Domaine :** language-and-types
- **Mots-clés :** satisfies, as, inférence, sécurité des types, assertions
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Livre :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell.
- **Chapitre :** 11, *Annotations and Assertions*.
- **Pages physiques PDF retenues :** 255–260 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 255, 257, 258, 259, 260.
- **Empreinte SHA-256 du PDF source :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Vérifier qu’une configuration respecte un contrat tout en conservant les types précis inférés.

## Ce qui vient du livre

Le chapitre oppose les annotations de variables, qui imposent une forme plus générale, à l’opérateur satisfies, qui vérifie la compatibilité tout en préservant une inférence utile. Il montre aussi qu’une assertion as peut masquer une valeur absente et provoquer une erreur à l’exécution.

## Interprétation et application Louvre (originale)

Pour les paramètres de navigation d’une application, déclarer un contrat et contrôler les valeurs avec satisfies ; ne pas employer as pour faire passer un JSON externe pour une configuration valide.

## Principe d'architecture et de raisonnement

Utiliser une vérification statique pour les constantes écrites dans le code et une validation à l’exécution pour les données reçues des utilisateurs, de l’API ou de l’environnement.

## Exemple original, non copié du livre

```ts
type Role = "reader" | "editor";
const permissions = {
  articles: ["reader", "editor"],
  settings: ["editor"],
} satisfies Record<string, Role[]>;

const settingsRoles = permissions.settings; // conserve la forme inférée

function readPositiveInt(v: string | null): number | null {
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
```

## Limites et compatibilité

satisfies n’effectue aucun contrôle à l’exécution ; une assertion as ne convertit pas une valeur. Les effets exacts sur les littéraux et la mutabilité dépendent du contexte d’inférence.

## Validation à réaliser dans un projet réel

Vérifier avec tsc qu’un rôle inconnu est rejeté et tester les cas null, "0", "3", "3a" et nombres hors plage.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.