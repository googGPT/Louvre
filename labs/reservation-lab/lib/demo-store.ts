import { ReservationStore } from "./reservation-store";

// App Router can bundle route modules independently. Keep one in-memory store
// per Node.js process across /api/workshops and /api/reservations (and HMR).
// NOT shared between processes, regions, or serverless instances; NOT durable.
const registry = globalThis as typeof globalThis & { __louvreDemoStore?: ReservationStore };
export const demoStore = registry.__louvreDemoStore ??= new ReservationStore();