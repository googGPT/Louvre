/** Louvre TS15-005: original discriminated result; this is NOT runtime validation. */
export type Result<T, E extends { message: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type WorkshopId = "typescript-clinic" | "nextjs-lab" | "github-actions";

export type Workshop = {
  id: WorkshopId;
  title: string;
  subtitle: string;
  duration: string;
  capacity: number;
  remaining: number;
};

export type BookingInput = {
  workshopId: WorkshopId;
  quantity: number;
  requestId: string;
};

export type Booking = {
  reservationId: string;
  workshopId: WorkshopId;
  quantity: number;
  remaining: number;
};

export type BookingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_QUANTITY"
  | "UNKNOWN_WORKSHOP"
  | "FULL"
  | "IDEMPOTENCY_CONFLICT";

export type BookingError = { code: BookingErrorCode; message: string };

const WORKSHOP_IDS: readonly WorkshopId[] = [
  "typescript-clinic", "nextjs-lab", "github-actions"
];

const REQUEST_ID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export function parseBookingInput(input: unknown): Result<BookingInput, BookingError> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Un objet JSON est attendu." } };
  }
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(k => !["workshopId", "quantity", "requestId"].includes(k))) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Champ inconnu dans la demande." } };
  }
  if (typeof fields.workshopId !== "string" || !WORKSHOP_IDS.includes(fields.workshopId as WorkshopId)) {
    return { ok: false, error: { code: "UNKNOWN_WORKSHOP", message: "Atelier inconnu." } };
  }
  if (typeof fields.quantity !== "number" || !Number.isInteger(fields.quantity) || fields.quantity < 1 || fields.quantity > 4) {
    return { ok: false, error: { code: "INVALID_QUANTITY", message: "Choisis entre 1 et 4 places." } };
  }
  if (typeof fields.requestId !== "string" || !REQUEST_ID.test(fields.requestId)) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Identifiant de demande invalide." } };
  }
  return {
    ok: true,
    value: { workshopId: fields.workshopId as WorkshopId, quantity: fields.quantity, requestId: fields.requestId }
  };
}