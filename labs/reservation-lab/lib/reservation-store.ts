import { SEED_WORKSHOPS } from "./catalog";
import type { Booking, BookingError, BookingInput, Result, Workshop, WorkshopId } from "./contracts";

/**
 * Educational SINGLE-PROCESS store. reserve() is synchronous (no await between
 * inventory check and decrement), preventing oversell within one JS event loop.
 * It is NOT safe across processes/replicas and is NOT persistent.
 */
export class ReservationStore {
  private readonly remaining = new Map<WorkshopId, number>();
  private readonly seen = new Map<string, { input: BookingInput; booking: Booking }>();
  private counter = 0;

  constructor(private readonly seeds: readonly Omit<Workshop, "remaining">[] = SEED_WORKSHOPS) {
    for (const w of seeds) this.remaining.set(w.id, w.capacity);
  }

  list(): Workshop[] {
    return this.seeds.map(w => ({ ...w, remaining: this.remaining.get(w.id) ?? 0 }));
  }

  reserve(input: BookingInput): Result<Booking, BookingError> {
    // Validate at the domain boundary as well; do not trust direct callers.
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 4) {
      return { ok: false, error: { code: "INVALID_QUANTITY", message: "Choisis entre 1 et 4 places." } };
    }
    const prior = this.seen.get(input.requestId);
    if (prior) {
      if (prior.input.workshopId !== input.workshopId || prior.input.quantity !== input.quantity) {
        return { ok: false, error: { code: "IDEMPOTENCY_CONFLICT", message: "Cette demande existe avec un autre contenu." } };
      }
      return { ok: true, value: { ...prior.booking } };
    }
    const capacity = this.remaining.get(input.workshopId);
    if (capacity === undefined) {
      return { ok: false, error: { code: "UNKNOWN_WORKSHOP", message: "Atelier inconnu." } };
    }
    if (capacity < input.quantity) {
      return { ok: false, error: { code: "FULL", message: "Il ne reste pas assez de places." } };
    }
    // Check and write happen atomically within this JS process (no await here).
    const left = capacity - input.quantity;
    this.remaining.set(input.workshopId, left);
    const booking: Booking = {
      reservationId: `DEMO-${String(++this.counter).padStart(5, "0")}`,
      workshopId: input.workshopId,
      quantity: input.quantity,
      remaining: left
    };
    this.seen.set(input.requestId, { input: { ...input }, booking: { ...booking } });
    return { ok: true, value: booking };
  }
}