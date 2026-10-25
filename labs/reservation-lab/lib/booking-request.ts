import type { Booking, BookingInput, BookingError } from "./contracts";

/**
 * Louvre engineering adaptation: a lost acknowledgement is NOT a failed booking.
 * Keep exactly the same requestId and payload when retrying an uncertain request.
 * An authenticated/persistent multi-instance service is a separate requirement.
 */
export type BookingAttemptOutcome =
  | { kind: "confirmed"; booking: Booking }
  | { kind: "rejected"; error: BookingError }
  | { kind: "uncertain"; message: string };

type TransportResponse = {
  status: number;
  json(): Promise<unknown>;
};

export type BookingTransport = (attempt: BookingInput) => Promise<TransportResponse>;

const UNCERTAIN_MESSAGE =
  "Réponse incertaine : la réservation a peut-être été enregistrée. Réessayez la même demande, sans créer de nouvelle réservation.";

function isBooking(value: unknown, attempt: BookingInput): value is Booking {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const booking = value as Record<string, unknown>;
  return typeof booking.reservationId === "string" &&
    /^DEMO-\d+$/.test(booking.reservationId) &&
    booking.workshopId === attempt.workshopId &&
    booking.quantity === attempt.quantity &&
    typeof booking.remaining === "number" &&
    Number.isInteger(booking.remaining) && booking.remaining >= 0;
}

function isExpectedError(value: unknown): value is BookingError {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const error = value as Record<string, unknown>;
  return typeof error.message === "string" && typeof error.code === "string" &&
    ["INVALID_REQUEST", "INVALID_QUANTITY", "UNKNOWN_WORKSHOP", "FULL", "IDEMPOTENCY_CONFLICT"].includes(error.code);
}

/**
 * A definitive 4xx response (except ambiguous timeout/overload statuses) clears
 * the pending request. Network failures, 5xx, 408, 429 or malformed successful
 * responses retain it so the same request can be replayed safely.
 */
export async function submitBookingAttempt(
  attempt: BookingInput,
  send: BookingTransport
): Promise<BookingAttemptOutcome> {
  try {
    const response = await send(attempt);
    if (response.status === 201) {
      const body: unknown = await response.json();
      return isBooking(body, attempt)
        ? { kind: "confirmed", booking: body }
        : { kind: "uncertain", message: UNCERTAIN_MESSAGE };
    }
    if (response.status >= 400 && response.status < 500 &&
        response.status !== 408 && response.status !== 429) {
      let body: unknown;
      try { body = await response.json(); } catch { /* keep fallback for definitive 4xx */ }
      return {
        kind: "rejected",
        error: isExpectedError(body)
          ? body
          : { code: "INVALID_REQUEST", message: "La demande a été refusée par le serveur." }
      };
    }
    return { kind: "uncertain", message: UNCERTAIN_MESSAGE };
  } catch {
    return { kind: "uncertain", message: UNCERTAIN_MESSAGE };
  }
}