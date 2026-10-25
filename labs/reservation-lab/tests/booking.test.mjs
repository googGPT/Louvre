import assert from "node:assert/strict";
import { test } from "node:test";
import { ReservationStore } from "../.domain-build/lib/reservation-store.js";
import { parseBookingInput } from "../.domain-build/lib/contracts.js";

let seed = 0;
const rid = () => `00000000-0000-4000-8000-${String(++seed).padStart(12, "0")}`;
const input = (overrides = {}) => ({ workshopId: "typescript-clinic", quantity: 1, requestId: rid(), ...overrides });

test("seed inventory contains three workshops", () => {
  const items = new ReservationStore().list();
  assert.equal(items.length, 3);
  assert.equal(items.find(w => w.id === "typescript-clinic").remaining, 4);
});
test("valid reservation decrements only selected inventory", () => {
  const store = new ReservationStore();
  const result = store.reserve(input({ quantity: 2 }));
  assert.equal(result.ok, true);
  assert.equal(result.value.remaining, 2);
  assert.equal(store.list().find(w => w.id === "nextjs-lab").remaining, 3);
});
test("sold-out request does not decrement inventory", () => {
  const store = new ReservationStore();
  assert.equal(store.reserve(input({ quantity: 4 })).ok, true);
  const second = store.reserve(input());
  assert.equal(second.ok, false);
  assert.equal(second.error.code, "FULL");
  assert.equal(store.list()[0].remaining, 0);
});
test("idempotency retry returns same ID without duplicate reservation", () => {
  const store = new ReservationStore();
  const req = input({ quantity: 2 });
  const a = store.reserve(req), b = store.reserve(req);
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.equal(store.list()[0].remaining, 2);
});
test("same idempotency key with changed request is rejected", () => {
  const store = new ReservationStore();
  const req = input();
  store.reserve(req);
  const result = store.reserve({ ...req, quantity: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "IDEMPOTENCY_CONFLICT");
});
test("concurrent requests within one event loop cannot oversell", async () => {
  const store = new ReservationStore();
  const cases = await Promise.all(Array.from({ length: 12 }, () => Promise.resolve().then(() => store.reserve(input()))));
  assert.equal(cases.filter(r => r.ok).length, 4);
  assert.equal(cases.filter(r => !r.ok && r.error.code === "FULL").length, 8);
  assert.equal(store.list()[0].remaining, 0);
});
test("unknown workshop is rejected in domain", () => {
  const result = new ReservationStore().reserve(input({ workshopId: "missing" }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN_WORKSHOP");
});
test("invalid quantity rejected by domain", () => {
  const store = new ReservationStore();
  for (const quantity of [0, -2, 1.5, 5, Number.NaN]) {
    const result = store.reserve(input({ quantity }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_QUANTITY");
  }
  assert.equal(store.list()[0].remaining, 4);
});
test("runtime validation accepts exact documented fields", () => {
  assert.equal(parseBookingInput(input()).ok, true);
});
test("runtime validation rejects unknown fields including spoofed userId", () => {
  const result = parseBookingInput(input({ userId: "admin" }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REQUEST");
});
test("runtime validation rejects object, array, malformed ID and quantity", () => {
  for (const candidate of [null, [], "hi", {}, input({ requestId: "bad" }), input({ quantity: "2" })]) {
    assert.equal(parseBookingInput(candidate).ok, false);
  }
});
test("returned booking mutations cannot change stored idempotency receipt", () => {
  const store = new ReservationStore();
  const req = input();
  const first = store.reserve(req);
  first.value.remaining = -200;
  const second = store.reserve(req);
  assert.equal(second.value.remaining, 3);
});