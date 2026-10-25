# TS06-001 — Mettre à jour un objet sans dupliquer les contrats

## Identification

- **Identifiant unique :** `TS06-001`
- **Domaine :** language-and-types
- **Mots-clés :** Partial, Omit, Pick, API patch, DTO, champs modifiables
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Livre :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell.
- **Chapitre :** 6, *Objects*.
- **Pages physiques PDF retenues :** 159–167 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 159, 161, 166, 167.
- **Empreinte SHA-256 du PDF source :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Construire une entrée de mise à jour sans recopier chaque propriété du modèle.

## Ce qui vient du livre

Le chapitre présente Partial pour rendre facultatives les propriétés, Pick pour sélectionner les champs et Omit pour en exclure. Son exercice de mise à jour combine Partial<Omit<Product, "id">> afin de permettre une modification partielle tout en retirant la clé identifiante.

## Interprétation et application Louvre (originale)

Pour un projet de gestion documentaire, dériver les champs modifiables du contrat de base et maintenir une liste explicite des champs interdits. Conserver une validation côté serveur indépendante des types.

## Principe d'architecture et de raisonnement

Un contrat de référence unique et des types de projection dérivés évitent la dérive entre modèle et formulaire. Exclure les données sensibles et les clés gérées par le serveur.

## Exemple original, non copié du livre

```ts
interface Dossier {
  id: string;
  ownerId: string;
  titre: string;
  statut: "draft" | "published";
  description: string;
}

type DossierPatch = Partial<Pick<Dossier, "titre" | "description">>;

function validatePatch(input: unknown): DossierPatch {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Objet attendu");
  }
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).some(k => !["titre", "description"].includes(k))) {
    throw new Error("Champ non modifiable");
  }
  for (const value of Object.values(obj)) {
    if (typeof value !== "string") throw new Error("Texte attendu");
  }
  return obj as DossierPatch;
}
```

## Limites et compatibilité

Partial est superficiel et admet un objet vide. TypeScript ne valide pas le JSON entrant. La liste réelle des champs modifiables dépend des règles d’autorisation et de l’API ; interdire les champs inconnus et les mutations non autorisées.

## Validation à réaliser dans un projet réel

Compiler un exemple TypeScript puis tester en exécution les payloads {}, {titre:"X"}, {ownerId:"X"}, null et les valeurs de mauvais type.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.