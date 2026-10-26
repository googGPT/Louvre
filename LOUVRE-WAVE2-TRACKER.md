# Louvre App Factory vague 2 — Registre de reprise

Base GitHub auditée : `main` commit `6d5ffbcc14038ce1a257122ef8b166ad8047c874` le 26 octobre 2026.

Statut des PR première vague au début de la mission : #18, #19, #21 fusionnées ; #20 et #22–#37 ouvertes ; PR #38 ouverte avec un titre proche de SplitFair. Ne jamais fusionner automatiquement.

## Inventaire et exclusions : 27 applications précédentes

| Application | Fonction centrale (exclusion) |
|---|---|
| MoneyUntil | Budget jusqu’à la paie |
| ReceiptRescue | Tickets, retours et garanties |
| SnapAction | Saisie de rappels |
| FridgeFirst | Inventaire alimentaire et recettes |
| HomePulse | Entretien domestique |
| ParkWise | Simulation de coûts de parking |
| FindMyStuff | Localisation des objets |
| SplitFair | Partage de frais |
| FocusForge | Concentration |
| StudyRecall | Révisions espacées |
| TripPack | Liste de bagages |
| PriceLens | Prix unitaires |
| BillCalendar | Abonnements |
| HabitSteps | Habitudes |
| GiftNest | Cadeaux |
| ReadTrail | Livres lus |
| FuelMath | Coût carburant |
| DecisionDeck | Choix multicritères |
| EventCount | Invités et événements |
| RoundPlan | Séances fractionnées |
| WorldMeet | Fuseaux horaires réunions |
| ChoreWheel | Tâches ménagères |
| MileageBook | Journal de kilomètres |
| TravelDay | Planning voyage |
| SizeMatch | Tailles vêtements |
| GoalLadder | Progression objectifs |
| QuizCraft | Quiz personnels |

## Évaluation anti-doublon : 20 nouveaux produits ou pistes

| # | Produit | Fonction distincte | Application précédente la plus proche | Algorithme spécifique | Statut de réalisation | PR |
|---|---|---|---|---|---|---|
| 01 | GradePilot | Moyenne académique coefficientée et seuil futur | StudyRecall / QuizCraft | calcul inverse de note requise | v2 auditée : moyenne et seuil arrondi par excès, stockage transactionnel, simulation ; consulter CI du dernier SHA | [#39](https://github.com/googGPT/Louvre/pull/39) |
| 02 | ShiftLedger | Horaires, pauses, rémunération théorique | RoundPlan | reconstitution des pauses et durée | Piste évaluée ; non développée | — |
| 03 | ColorContrast | Audit contrastes et palettes WCAG | aucune | luminance sRGB + AA/AAA | Code + tests Node réussis localement ; CI Chrome à confirmer | — |
| 04 | ImageShrink | Compression locale d’images | ReceiptRescue (photos accessoires) | redimensionnement et qualité image | Application créée et auditée : compression/conversion locale, garde dimensions, 34 tests Node + Chromium mobile/offline réussis (PR #49) | [#49](https://github.com/googGPT/Louvre/pull/49) |
| 05 | QRForge | QR codes locaux | aucune | encodage QR et masque | Application créée, auditée et testée : MIT QR Model 2, URL/Wi-Fi, SVG/PNG, 40/40 Node et décodage indépendant ZXing-C++ validés | [#50](https://github.com/googGPT/Louvre/pull/50) |
| 06 | CSVClinic | Nettoyage CSV et doublons | aucune | parseur CSV quote/newlines et dédup | Piste évaluée ; non développée | — |
| 07 | TextDiff | Comparaison textuelle | aucune | LCS et alignement de modifications | Application initiale créée : LCS par lignes/mots, export sûr, bornes 700 unités, tests Node + Chromium ; [QA](https://github.com/googGPT/Louvre/actions/runs/40409322718) initiale réussie, CI du HEAD final à vérifier | [#51](https://github.com/googGPT/Louvre/pull/51) |
| 08 | CitationCraft | Gestion bibliographique BibTeX/RIS | ReadTrail (livres personnels) | sérialisation de références structurées | Application créée : CRUD local transactionnel, BibTeX/RIS/JSON, champs inconnus signalés, DOI/clé sans doublons, 56 tests Node et Chromium réussis ; CI finale à vérifier | [#52](https://github.com/googGPT/Louvre/pull/52) |
| 09 | InvoiceCanvas | Devis et factures imprimables | SplitFair (dépenses partagées) | TVA, HT/TTC et numérotation | Application initiale créée : centimes entiers, arrondis TVA par ligne, copies numérotées localement, impression A4 et JSON ; 54 tests Node et Chromium validés, conformité fiscale non certifiée ; CI finale à vérifier | [#53](https://github.com/googGPT/Louvre/pull/53) |
| 10 | RoomSketch | Plan de pièce à échelle | HomePulse | géométrie 2D, zones de collision | Piste évaluée ; non développée | — |
| 11 | KeyboardCoach | Vitesse de frappe et précision | aucune | mots/minutes ajustés erreurs | Piste évaluée ; non développée | — |
| 12 | LaundryDecoder | Symboles d’entretien textile | FridgeFirst (usage cuisine) | décodage pictogrammes par catégories | Piste évaluée ; non développée | — |
| 13 | PollBox | Sondage anonyme sur un appareil | EventCount | comptage local et anonymisation | Piste évaluée ; non développée | — |
| 14 | FileIntegrity | SHA-256 de fichiers | aucune | WebCrypto SHA-256 | Piste évaluée ; non développée | — |
| 15 | SeatArrange | Plan de placement | EventCount (invités) | attribution des sièges avec contraintes | Piste évaluée ; non développée | — |
| 16 | CareerMatch | Correspondance CV/offre d’emploi locale | aucune | comparaison lexicale non prédictive | Piste évaluée ; non développée | — |
| 17 | LoanSim | Prêts et remboursement anticipé | MoneyUntil | amortissement nominal fixe en centimes | Code + tests Node réussis localement ; CI Chrome à confirmer | — |
| 18 | MarkdownDesk | Éditeur Markdown local | aucune | rendu sûr sans HTML arbitraire | Piste évaluée ; non développée | — |
| 19 | LogicLab | Tables de vérité booléennes | QuizCraft | parseur d’expressions et table d’évaluation | Piste évaluée ; non développée | — |
| 20 | TimelineBuilder | Frises chronologiques | TravelDay (agenda voyage) | placement temporel sur une échelle | Piste évaluée ; non développée | — |

## Critères et coûts

Les 20 concepts sont distincts par problème, modèle de données et algorithme. Ils restent des hypothèses de produits tant que code et tests navigateur ne sont pas validés. Aucun abonnement ni API payante nécessaire à la conception envisagée ; quotas de GitHub Pages/Actions applicables.

## Procédure de reprise

1. Lire `AGENTS.md`, `.agents/skills/louvre-technical-reference/SKILL.md` et `technical-library/INDEX.md`.
2. Vérifier les PR #18–#37 et l’état actuel de `main` (peut changer).
3. Examiner les résultats CI des PR de la vague 2 ; corriger les échecs et valider la conformité métier avant merge.
4. Les PR restent non fusionnées tant que l’utilisateur n’en donne pas l’autorisation.
5. Continuer le produit suivant sans recycler une simple interface CRUD.

## Traçabilité documentaire

Chaque application réalisée possède `apps/<slug>/LOUVRE-REVIEW.md` indiquant les cinq sources Louvre, les fiches réellement lues, les adaptations de code et les limites. Les références bibliographiques viennent des fiches ; ne pas prétendre avoir relu les PDF originaux à cette étape.