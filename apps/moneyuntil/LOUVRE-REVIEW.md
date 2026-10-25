# MoneyUntil 1.1 — audit et amélioration gratuits, fondés sur Louvre

## But et coût

MoneyUntil reste une application **HTML + CSS + JavaScript entièrement statique** sur GitHub Pages. Aucun compte, serveur applicatif, base payante, API IA, publicité, mesure d'audience ou dépendance JavaScript externe. Les données budgétaires restent dans le `localStorage` du navigateur ; elles peuvent être exportées en JSON et restaurées manuellement. Le service GitHub Pages / GitHub Actions est utilisé sous les conditions et quotas du compte ; cette version ne crée aucun service facturable.

## Décisions traçables à cinq livres (via les fiches Louvre)

Les **fiches de synthèse de Louvre** ont été lues ; il ne faut pas confondre cette consultation avec une nouvelle lecture exhaustive des cinq PDF.

| Livre / référence de la bibliothèque | Principe retenu | Application concrète (interprétation d'ingénierie, et non citation du livre) |
|---|---|---|
| `SRC-001`, *Total TypeScript*, [TS16-001](../../technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md) (chap. 16, pages PDF 396–400) | Ne pas faire confiance aux types des données externes sans contrôles runtime | `validateBackup` vérifie à l'exécution les champs exacts, catégories, montants et dates du JSON de sauvegarde. Pas d'installation obligatoire de TypeScript. |
| `SRC-002`, *The Complete Developer*, [FULL08-001](../../technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md) (chap. 8, pages PDF 160–174) | Tests de comportements et doubles de dépendance | 15 tests utilisant le module Node natif `node:test` et un faux stockage navigateur ; tests du calcul, import, anomalie de stockage et scénario. |
| `SRC-003`, *Ultimate Next.js*, [NEXT08-001](../../technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md) (chap. 8, pages PDF 212–226) | Distinguer état UI, état persisté et valeurs dérivées | Le montant d'un achat simulé reste dans le formulaire ; il n'est **jamais** enregistré comme dépense, contrairement au budget réel. Aucun framework serveur nécessaire. |
| `SRC-004`, *Building Real-World Web Applications with Vue.js 3*, [VUE07-001](../../technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md) (chap. 7, pages PDF 186–202) et [VUE05-001](../../technical-library/concepts/frontend/VUE05-001-pinia-state.md) (chap. 5, pages PDF 133–144) | Séparer calculs de métier, accès au stockage et affichage ; dériver l'état plutôt que le dupliquer | `calculateBudget` et `purchaseScenario` sont des fonctions pures appelées par le rendu, sans ajouter Vue/Quasar/Supabase. |
| `SRC-005`, *Learning GitHub Actions*, [GHA09-001](../../technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md) (chap. 9, pages PDF 210–220) | Droits minimaux et validation en CI | Un job de test à permissions `contents: read` doit réussir avant le déploiement ; les permissions Pages sont limitées au seul job de publication. |

Les plages PDF ci-dessus sont celles **indiquées dans les fiches Louvre**. Ce projet ne republie aucun PDF ni extrait protégé. Les applications et tests présentés ici sont des adaptations originales.

## Changements réalisés

- Calcul des montants et factures en **centimes entiers** pour éviter les dérives courantes des flottants. Le budget journalier est arrondi **vers le bas** au centime pour éviter de surestimer une dépense prudente.
- Simulateur « Et si je fais cet achat ? » : comparaison du montant disponible avant et après un achat hypothétique. Il ne crée aucune transaction et ne sauvegarde pas le montant simulé.
- Validation stricte des sauvegardes au format version 1, sans changer la clé `moneyuntil:v1` : compatibilité avec les anciennes données valides. Refus des clés supplémentaires et des catégories invalides (y compris clés héritées des prototypes JavaScript).
- Si la sauvegarde locale est corrompue ou inaccessible, elle **n'est pas écrasée automatiquement**. Un avertissement persistant propose une restauration JSON ; une restauration ou une remise à zéro explicite permet de réactiver le stockage quand il fonctionne.
- Ajout de tests déterministes sans `npm install` ni réseau. `index.html` et `index.htm` restent identiques.

## Vérifications exécutées localement (25 octobre 2026)

- `node --check` du script embarqué : réussi après correction d'une erreur de syntaxe détectée pendant le développement.
- `node --test apps/moneyuntil/tests/moneyuntil.test.mjs` sur Node.js 22.16.0 : **15/15 réussis** ; doubles de stockage et fonctions réelles extraites de l'HTML.
- Chromium headless via `page.set_content` : script chargé sans erreur JavaScript, modale de configuration ouverte, simulation recalculée sur mobile. L'environnement de navigation de test interdit les URLs `file:` et `localhost`, ce qui **empêche une vérification navigateur complète de la persistance après rechargement sur une véritable origine HTTPS**. Le stockage bloqué dans ce contexte déclenche correctement l'avertissement. Le comportement de production doit être vérifié après fusion sur GitHub Pages.

## Limites connues

- Le solde est *estimé* d'après les saisies, **pas** connecté à une banque. Une opération inscrite à la fois comme dépense et comme facture payée sera comptée deux fois : l'utilisateur doit choisir une seule représentation.
- Le stockage local peut être effacé par le navigateur, le mode privé ou l'utilisateur ; une exportation régulière reste importante. Aucun chiffrement n'est mis en place par cette version : les personnes qui utilisent le même profil navigateur peuvent potentiellement voir les données.
- Le simulateur n'est pas un conseil financier. Il ne connaît pas les rentrées d'argent exceptionnelles ni les mouvements bancaires non renseignés.
- Le service public GitHub Pages doit toujours rester configuré ; son hébergement gratuit est soumis aux limites de GitHub.