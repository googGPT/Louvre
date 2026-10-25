/**
 * Louvre 3C4 — exemples originaux (notebook d'intégration des principes).
 * Compilation stricte sous TypeScript 5.8.3, tests Node 22.
 * Aucun framework ni modèle IA n'est exécuté ici.
 */
export function sortScores(scores: readonly number[]): number[] {
  return [...scores].sort((a, b) => b - a);
}

export const UI_POLICY = { mode: "review", maxUsers: 25 } as const;

export function pageOffset(page: number, size: number): number {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("page invalide");
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("taille invalide");
  const offset = (page - 1) * size;
  if (!Number.isSafeInteger(offset)) throw new Error("offset invalide");
  return offset;
}

type Detection = { label: string; score: number };
export function acceptedLabels(items: readonly Detection[], minScore = 0.75): string[] {
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw new Error("seuil invalide");
  return items
    .filter(x => Number.isFinite(x.score) && x.score >= minScore && x.score <= 1)
    .map(x => x.label);
}

export type CreatePayload = { title: string };
export function parseCreate(input: unknown): CreatePayload | null {
  if (typeof input !== "object" || !input || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const title = record.title;
  return typeof title === "string" && title.trim().length > 0 && title.length <= 120
    ? { title: title.trim() }
    : null;
}

export function authorizeProjectEdit(viewer: { id: string } | null, ownerId: string): boolean {
  return viewer !== null && viewer.id === ownerId;
}

export async function getPublicProject(
  repo: { findPublicById(id: string): Promise<{ id: string; title: string } | null> },
  id: string
): Promise<{ id: string; title: string } | null> {
  if (!/^[a-z0-9-]{1,50}$/.test(id)) return null;
  return repo.findPublicById(id);
}