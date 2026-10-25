# VUE06-001 — Transformer des données persistées en graphiques Vue

## Identification

- **Identifiant unique :** `VUE06-001`
- **Domaine :** frontend
- **Mots-clés :** Vue 3, Chart.js, vue-chartjs, graphiques, agrégation, Pinia
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Livre :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten.
- **Chapitre :** 6, *Creating a Fitness Tracker with Data Visualization*.
- **Pages physiques PDF retenues :** 171–182 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 171, 172, 176, 177, 179, 180, 181, 182.
- **Empreinte SHA-256 du PDF source :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Produire des visualisations cohérentes à partir de données collectées par une application.

## Ce qui vient du livre

Le chapitre construit un suivi d’activités physiques, puis introduit vue-chartjs et Chart.js ; il prépare les données dans un store et rend des graphiques circulaires et linéaires dans des composants dédiés. Le texte souligne l’importance d’un format de données adapté aux graphiques.

## Interprétation et application Louvre (originale)

Pour un tableau de bord de projets, agréger des événements par mois dans une fonction pure, puis fournir `{ labels, datasets }` au composant Vue chargé de l’affichage.

## Principe d'architecture et de raisonnement

Séparer récupération des données, agrégation et rendu graphique ; définir explicitement les unités, les dates, les valeurs manquantes et le tri chronologique.

## Exemple original, non copié du livre

```ts
type Event = { day: string; count: number };
function toMonthlySeries(events: Event[]) {
  const totals = new Map<string, number>();
  for (const item of events) {
    const week = item.day.slice(0, 7); // démo mensuelle, non ISO-week
    totals.set(week, (totals.get(week) ?? 0) + item.count);
  }
  const labels = [...totals.keys()].sort();
  return {
    labels,
    datasets: [{ label: "Événements mensuels", data: labels.map(k => totals.get(k) ?? 0) }],
  };
}
```

## Limites et compatibilité

La démonstration regroupe par mois sur une clé YYYY-MM et suppose des dates ISO prévalidées ; ce n’est pas une agrégation par semaine ISO. Les graphiques seuls ne valident ni les entrées ni les définitions des métriques. Vérifier les versions chart.js/vue-chartjs.

## Validation à réaliser dans un projet réel

Tester les doublons, valeurs négatives, dates invalides, périodes sans observation et ordre des séries avant montage dans Vue.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.