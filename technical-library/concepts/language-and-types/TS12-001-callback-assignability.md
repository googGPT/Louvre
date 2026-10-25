# TS12-001 — Contrats de callbacks et unions de fonctions

## Identification

- **Identifiant unique :** `TS12-001`
- **Domaine :** language-and-types
- **Mots-clés :** TypeScript, fonction callback, assignabilité, paramètres ignorés, union de fonctions
- **Statut :** synthèse originale fondée sur une lecture ciblée des pages PDF ; application non validée en production.

## Source et traçabilité

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 12, *The Weird Parts*.
- **Pages physiques PDF analysées :** 295–298 (numérotation à partir de 1, non identique à la pagination imprimée).
- **Pages effectivement inspectées :** 295, 296, 297, 298.
- **SHA-256 du PDF source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Provenance :** lecture du fichier PDF dans l'environnement ChatGPT. Ne pas prétendre que Codex ou les GitHub Actions ont ouvert ces PDF.

## Problème concret

Une bibliothèque d’événements reçoit des callbacks avec un nombre variable de paramètres ; une union de signatures peut casser l’inférence du callback.

## Ce que le livre établit sur les pages indiquées

Le chapitre explique qu’un callback recevant trois arguments peut être implémenté avec seulement les premiers paramètres utilisés. Il distingue cette règle de la difficulté posée par l’union de plusieurs fonctions et montre qu’une invocation via union peut demander un argument satisfaisant simultanément les signatures.

## Interprétation et décision d'ingénierie Louvre

Décrire **la signature réelle de l’appel effectué par le producteur**, et non une union de toutes les formes que les consommateurs pourraient écrire. Éviter `any` pour contourner une union de callbacks. En cas de fonctions hétérogènes indexées par clé, maintenir la corrélation entre clé et argument via un générique, une surcharge ou un `switch` explicite.

## Exemple original (pas un extrait du livre)

```ts
// Adaptation Louvre : un service annonce toujours ces 3 paramètres.
type OnProgress = (step: string, percent: number, final: boolean) => void;
function report(callback: OnProgress): void {
  callback("upload", 100, true);
}
report(step => console.log(step));           // Ignore 2 arguments.
report((step, percent) => console.log(percent));
// report((a, b, c, d) => {}); // Erreur de typage : 4e argument non fourni.
```

## Limites et conditions d'usage

Ne pas confondre l’acceptation d’un callback à moins de paramètres et l’appel d’un callback avec des arguments manquants. La variance, les méthodes et les signatures facultatives méritent des tests sous `strictFunctionTypes`. Le code ne gère pas le déroulement réel d’un transfert.

## Vérification exigée dans un projet réel

Compilation TypeScript en mode strict des callbacks à 1 et 2 paramètres, plus un cas à 4 paramètres attendu en erreur ; vérifier que la fonction productrice appelle réellement la signature annoncée.

## Connexions avec les autres fiches

- Fiche antérieure : `TS15-001-generic-types.md` (à retrouver via `technical-library/INDEX.md`).

## Niveau de confiance

- **Documentaire :** les passages de pages indiquées ont été directement consultés ; couverture ciblée, non chapitre intégral.
- **Exemple :** la fiche ne revendique pas à elle seule d'exécution ou d'intégration dans une application ; consulter le rapport du lot pour les tests réellement réalisés.
- **Version actuelle :** les APIs de frameworks et services peuvent avoir évolué depuis l'édition du livre ; vérifier la documentation officielle de la version ciblée.