/**
 * Louvre cross-book demonstration (ORIGINAL), not copied from the books.
 * This is input validation and domain authorization, NOT an atomic booking engine.
 */
export type ReservationError =
  | { code: "INVALID_QUANTITY"; message: string }
  | { code: "MISSING_IDENTITY"; message: string }
  | { code: "INVALID_WORKSHOP_ID"; message: string };

export type Result<T, E extends { message: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };

type ProposedReservation = { workshopId: string; quantity: number; ownerId: string };

export function prepareReservation(
  body: unknown,
  verifiedSessionUserId: string | null,
): Result<ProposedReservation, ReservationError> {
  if (verifiedSessionUserId === null || verifiedSessionUserId.length === 0) {
    return { ok: false, error: { code: "MISSING_IDENTITY", message: "Session required" } };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: { code: "INVALID_WORKSHOP_ID", message: "Payload must be an object" } };
  }
  const v = body as Record<string, unknown>;
  if (typeof v.workshopId !== "string" || v.workshopId.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_WORKSHOP_ID", message: "Workshop ID is required" } };
  }
  if (typeof v.quantity !== "number" || !Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 20) {
    return { ok: false, error: { code: "INVALID_QUANTITY", message: "Quantity must be 1..20" } };
  }
  // Ignore client-supplied ownerId: owner comes exclusively from server-verified session.
  return {
    ok: true,
    value: { workshopId: v.workshopId.trim(), quantity: v.quantity, ownerId: verifiedSessionUserId },
  };
}