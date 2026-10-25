import type { Workshop, WorkshopId } from "./contracts";

/** Demonstration inventory; does not represent live event availability. */
export const SEED_WORKSHOPS: readonly Omit<Workshop, "remaining">[] = [
  { id: "typescript-clinic", title: "Atelier TypeScript", subtitle: "Contrats, types et erreurs métier", duration: "45 min", capacity: 4 },
  { id: "nextjs-lab", title: "Laboratoire Next.js", subtitle: "Interfaces et routes API", duration: "60 min", capacity: 3 },
  { id: "github-actions", title: "Studio GitHub Actions", subtitle: "Tests et automatisation CI", duration: "50 min", capacity: 5 }
];

export function isWorkshopId(id: string): id is WorkshopId {
  return SEED_WORKSHOPS.some(w => w.id === id);
}