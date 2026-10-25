# Tâche identique — expérimentation Codex A/B n°1

**Ne changez pas la portée du problème.** Dans `labs/reservation-lab`, implémentez une reprise sûre d'une demande de réservation dont la réponse HTTP est incertaine après un rechargement de page dans le **même onglet**.

## Exigences fonctionnelles

1. Une réponse réseau absente ou ambiguë ne doit **pas** être interprétée comme un échec définitif du serveur.
2. Après rechargement, proposer un bouton explicite pour réessayer **exactement** la demande originale (`requestId`, `workshopId`, `quantity`). Aucun `POST` automatique à l'ouverture.
3. Enregistrer dans `sessionStorage` une seule demande incertaine, sans information personnelle et sans nouvelle clé d'idempotence lors de la reprise. Ne pas sauvegarder un succès ou un rejet définitif.
4. Rejeter/purger les données stockées invalides, expirées (>30 min), présentant des champs additionnels, ou avec une version inconnue. Valider à l'exécution, pas seulement avec TypeScript.
5. Ne jamais accéder à `window` ou `sessionStorage` pendant le rendu serveur.
6. Résister aux erreurs d'accès à `sessionStorage` (navigateurs bloquant le stockage) sans casser l'interface. Informer l'utilisateur de la limite si la reprise n'est pas disponible.
7. Conserver le fonctionnement du laboratoire (`npm run test:domain`, `npm run build`, `npm run test:smoke`). Aucune base durable, compte, paiement ni nouveau service ne doit être ajouté.
8. Documenter exactement les tests exécutés, les limites et les chemins de fichiers modifiés. N'inventez aucune validation ni source.

## Contrat d'essai pour la logique pure, commun aux deux groupes

Créer `labs/reservation-lab/lib/recovery-storage.ts` et exporter ces éléments (adaptation d'évaluation, pas une interface tirée d'un livre) :

```ts
export type StoragePort = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export const RECOVERY_KEY: string;
export function savePending(storage: StoragePort, input: BookingInput, now: number): boolean;
export function readPending(storage: StoragePort, now: number): BookingInput | null;
export function clearPending(storage: StoragePort): void;
```

Le format JSON persistant attendu est exactement `{ "version": 1, "input": { "workshopId": "...", "quantity": 1, "requestId": "..." }, "createdAt": 1790000000000 }`, sans champs supplémentaires à aucune profondeur. `BookingInput` provient de `./contracts`; `now` est un timestamp en **millisecondes Unix**. `savePending` renvoie `false` si le stockage est inaccessible ou les entrées invalides, `true` autrement. `readPending` retourne `null` et tente de purger les valeurs invalides, expirées ou d'une version inconnue, sans jamais relancer une requête. Un `readPending` réussi conserve la même demande et son horodatage de création. `clearPending` doit rester sûre si le stockage est inaccessible. Ne pas accepter de champs supplémentaires non prévus.

Mettre `lib/recovery-storage.ts` dans le `tsconfig.domain.json` (compilation CommonJS de test) et intégrer ces fonctions au composant React, uniquement après montage.

## Démonstration et restitution

- Ajouter des tests ordinaires pour les nouveaux comportements.
- Expliquer précisément les garanties **uniquement au sein d'une instance Node.js** : le store serveur reste en mémoire ; le cache d'idempotence sera perdu après son redémarrage ou lors d'un changement de serveur.
- **Condition A** : résoudre seulement à partir des sources disponibles dans le paquet A. **Condition B** : consulter l'index Louvre et les fiches pertinentes dans le paquet B, puis consigner les chemins réellement lus. Ne pas consulter le dépôt distant ni des solutions de l'autre condition.
- Ne pas copier les documents d'évaluation dans le paquet de développement : ils seront exécutés indépendamment après le travail.