/** Original Louvre examples verified under TypeScript 5.8.3 and Node 22. */
export interface Dossier {
  id: string;
  ownerId: string;
  titre: string;
  statut: "draft" | "published";
  description: string;
}
export type DossierPatch = Partial<Pick<Dossier, "titre" | "description">>;
export function validatePatch(input: unknown): DossierPatch {
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

type Role = "reader" | "editor";
export const permissions = {
  articles: ["reader", "editor"],
  settings: ["editor"],
} satisfies Record<string, Role[]>;

export function readPositiveInt(v: string | null): number | null {
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type Event = { day: string; count: number };
export function toMonthlySeries(events: Event[]) {
  const totals = new Map<string, number>();
  for (const item of events) {
    const month = item.day.slice(0, 7); // Accepts already validated ISO days.
    totals.set(month, (totals.get(month) ?? 0) + item.count);
  }
  const labels = [...totals.keys()].sort();
  return {
    labels,
    datasets: [{ label: "Événements mensuels", data: labels.map(k => totals.get(k) ?? 0) }],
  };
}

export function runExamples(): void {
  if (validatePatch({ titre: "Dossier A" }).titre !== "Dossier A") throw new Error("patch accepted");
  for (const bad of [null, { ownerId: "owner" }, { titre: 42 }, []]) {
    try { validatePatch(bad); throw new Error("unexpected success"); }
    catch (err) { if (err instanceof Error && err.message === "unexpected success") throw err; }
  }
  if (readPositiveInt("3") !== 3) throw new Error("positive integer");
  for (const bad of [null, "0", "3a", "9007199254740993"]) {
    if (readPositiveInt(bad) !== null) throw new Error("invalid positive integer");
  }
  const graph = toMonthlySeries([{ day: "2026-10-01", count: 2 }, { day: "2026-10-19", count: 3 }, { day: "2026-09-01", count: 1 }]);
  if (graph.labels.join() !== "2026-09,2026-10" || graph.datasets[0].data.join() !== "1,5") throw new Error("graph aggregation");
  console.log("Louvre 3C3: TS compile and 11 runtime cases passed");
}
runExamples();