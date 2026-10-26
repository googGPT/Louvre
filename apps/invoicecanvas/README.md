# InvoiceCanvas — Louvre application n° 29 (vague 2, 09/20)

## Diagnostic initial

Le registre \`LOUVRE-WAVE2-TRACKER.md\` classe **InvoiceCanvas** « Piste évaluée ; non développée » et prévoit « Devis et factures imprimables » avec TVA, HT/TTC et numérotation. L'audit de GitHub n'a trouvé ni \`apps/invoicecanvas\`, ni branche ni PR correspondante. Cette intervention est donc une **première création**, et non une correction imaginaire.

## Fonctions utilisables

- Préparation de **devis** et de **projets de facture** en euros, avec émetteur/client, SIREN, identifiants TVA éventuels, dates d'émission/prestation/échéance, bon de commande, nature de l'opération, adresse de livraison, conditions de règlement, notes et mention de justification éventuelle d'un taux nul.
- **Lignes** : libellé, quantité jusqu'à 3 décimales (strictement positive), prix unitaire HT jusqu'à 2 décimales (positif ou nul), taux de TVA entre 0 et 100 % avec jusqu'à 2 décimales. **Le taux est fourni par l'utilisateur** ; l'outil ne sélectionne pas le bon régime fiscal.
- Calculs déterministes **en centimes entiers**. Par ligne, \(HT = \operatorname{roundHalfUp}(quantité \times prix\_HT)\) ; \(TVA = \operatorname{roundHalfUp}(HT \times taux)\). Addition des HT et taxes **déjà arrondis par ligne**, puis \(TTC = HT + TVA\). Le détail TVA est regroupé par taux.
- **Aperçu dynamique imprimable A4** avec CSS dédié : les contenus sont placés dans le document par \`textContent\`, sans HTML injecté. Le bouton « Imprimer » utilise le dialogue du navigateur ; l'utilisateur peut choisir « Enregistrer au format PDF » si son navigateur le propose. L'application **ne fabrique pas un PDF ni Factur-X**.
- **Brouillons** conservés sur l'appareil dans \`localStorage\` (validation stricte et écriture transactionnelle) ; modifications/suppressions autorisées uniquement pour les brouillons. Après confirmation, un document peut être **verrouillé et numéroté localement** : \`F-AAAA-0001\` pour projet de facture ou \`D-AAAA-0001\` pour devis. Une copie verrouillée ne peut pas être modifiée ou supprimée **depuis l'application**.
- Le schéma \`{version:1, documents:[...]}\` limite le contenu à **120 documents, 60 lignes par document et 700 Ko de sauvegarde** ; les séries sont vérifiées sans doublons ni trou **à l'intérieur de ce stockage** et les dates sont chronologiques au sein de chaque série. Une création antidatée après un numéro verrouillé est refusée.
- Export **JSON**, restauration complète seulement après validation de tous les documents et **écriture réussie** ; si l'ancien stockage est corrompu, l'application bloque les changements et permet de télécharger une copie brute avant de le remplacer. Le service worker PWA conserve uniquement les fichiers statiques pour le mode hors ligne après la première visite.

## Important : pas un logiciel de facturation certifié

**InvoiceCanvas est un outil de préparation et d'impression**, et **ne garantit pas la conformité française des factures**. Le marquage imprimable reste volontairement « DOCUMENT DE TRAVAIL · CONFORMITÉ NON VÉRIFIÉE », même après le verrouillage local.

D'après les sources officielles consultées en octobre 2026 :

- [Entreprendre Service-Public — mentions obligatoires d'une facture](https://entreprendre.service-public.gouv.fr/vosdroits/F31808) et [guide sur la facturation](https://entreprendre.service-public.gouv.fr/vosdroits/F23208) : une facture requiert notamment dates et identités, prix HT/TVA/TTC, et **numéro unique dans une série chronologique continue**, avec d'autres mentions selon le statut de l'entreprise, la prestation, le client et les dates.
- [DGFiP — dates de la réforme](https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation) et [plateforme agréée](https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais) : depuis le 1er septembre 2026, la réception concerne toutes les entreprises assujetties à la TVA, l'émission concerne les grandes entreprises et les ETI ; le calendrier prévoit les PME/microentreprises à partir du 1er septembre 2027. Pour les opérations soumises au dispositif, une simple impression PDF **ne remplace pas** le flux conforme via une plateforme agréée.

Cet outil ne délivre pas de certification fiscale, **ne gère pas Factur-X/UBL/CII, plateformes agréées, Chorus Pro, e-reporting, avoirs, acomptes, paiement partiel, taxes spéciales, différents régimes de TVA, devis signés, authenticité, archivage légal ou pistes d'audit inaltérables**. La numérotation **n'est pas garantie entre plusieurs appareils, navigateurs, réinitialisations, utilisateurs ou sauvegardes importées** ; une sauvegarde JSON est éditable manuellement, et le stockage peut être supprimé. Aucune immutabilité juridique ou cryptographique n'est revendiquée. L'identité et le numéro SIREN sont validés **sur leur format** (9 chiffres), non sur l'existence légale de l'entreprise. Les mentions légales (pénalités, indemnité de recouvrement, assurance, forme juridique, etc.) doivent être complétées par l'utilisateur selon sa situation et vérifiées indépendamment.

Les taux, exemptions et le régime fiscal dépendent du produit/service, du lieu, du statut du client et d'autres facteurs ; ils ne sont **pas déterminés automatiquement**. L'arrondi **par ligne** est une convention calculatoire explicite et peut différer de systèmes arrondissant la TVA par taux ou sur la facture entière : vérifier la méthode exigée dans votre cas. Le calcul n'inclut pas les remises ni frais additionnels (ils devraient être saisis en lignes appropriées si applicables, sans garantir le traitement réglementaire).

## Confidentialité, qualité et limites

Tout est calculé dans le navigateur, sans API distante, télémétrie ni abonnement. **Les informations commerciales sont persistées dans \`localStorage\`, non chiffrées** : toute personne ayant accès au profil navigateur peut les lire. L'export et l'impression produisent des copies locales. L'utilisateur doit effectuer des sauvegardes hors navigateur et respecter ses propres obligations de protection/conservation de données. Les informations ne sont pas automatiquement synchronisées entre appareils. Le code essaie de détecter une modification externe avant écriture, sans prétendre garantir une isolation transactionnelle multi-onglets parfaite.

Les champs texte utilisateurs sont rendus via \`textContent\`, pas \`innerHTML\` ; limites de saisie, dates calendaires et prix décimaux sont validés. Les données corrompues/anciennes sont refusées, pas écrasées silencieusement.

## Test et maintenance

\`\`\`bash
node --check apps/invoicecanvas/core.js
node --check apps/invoicecanvas/app.js
node --check apps/invoicecanvas/sw.js
node --test apps/invoicecanvas/tests/core.test.cjs
python apps/invoicecanvas/tests/browser.test.py
\`\`\`

Tests de domaines : 5,5/10/20 %, quantité décimale, arrondis au centime, limites et valeurs malformées, dates impossibles, séries chronologiques, copies immuables, restauration invalide. Chromium : calculs réels, sauvegarde et rechargement, verrouillage, déclenchement du dialogue d'impression, CSS média print, numérotation séquentielle, sauvegarde/restauration, test XSS, échec de quota, corruption et mode hors ligne mobile 390 px.

**Ne pas annoncer le succès tant que la CI du dernier SHA n'a pas été consultée.**

## Traçabilité Louvre

\`LOUVRE-REVIEW.md\` fournit les références aux fiches TS16-001, FULL08-001, NEXT10-001, VUE02-001 et GHA09-001 consultées dans le dépôt. Les pages PDF mentionnées proviennent de ces **fiches documentées** et ne constituent pas une relecture des cinq PDF originaux. Le moteur arithmétique, les garde-fous fiscaux et la numérotation locale sont des **adaptations originales**, et non des citations des livres.

Le workflow Pages déjà présent inclut le slug \`invoicecanvas\` pour le déploiement **après fusion autorisée**. Aucune modification directement sur \`main\` n'est demandée.
