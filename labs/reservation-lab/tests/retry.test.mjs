import assert from "node:assert/strict";
import { test } from "node:test";
import { submitBookingAttempt } from "../.domain-build/lib/booking-request.js";

const attempt = {
  workshopId: "typescript-clinic",
  quantity: 1,
  requestId: "11111111-1111-4111-8111-111111111111"
};
const booked = {
  reservationId: "DEMO-00001",
  workshopId: attempt.workshopId,
  quantity: attempt.quantity,
  remaining: 3
};
const http = (status, payload) => ({ status, async json() { return payload; } });

test("a success is confirmed with its validated booking receipt", async () => {
  const result = await submitBookingAttempt(attempt, async () => http(201, booked));
  assert.deepEqual(result, { kind: "confirmed", booking: booked });
});

test("network lost after server commits is uncertain; replay sends identical id", async () => {
  const calls = [];
  const send = async input => {
    calls.push({ ...input });
    if (calls.length === 1) throw new Error("connection dropped after server commit");
    return http(201, booked); // server replays same receipt for requestId
  };
  assert.equal((await submitBookingAttempt(attempt, send)).kind, "uncertain");
  assert.equal((await submitBookingAttempt(attempt, send)).kind, "confirmed");
  assert.deepEqual(calls, [attempt, attempt]);
});

test("server 500 retains uncertainty rather than reporting a definitive rejection", async () => {
  assert.equal((await submitBookingAttempt(attempt, async () => http(500, {}))).kind, "uncertain");
});

test("timeout and throttling remain uncertain", async () => {
  for (const status of [408, 429, 502, 503, 504]) {
    assert.equal((await submitBookingAttempt(attempt, async () => http(status, {}))).kind, "uncertain");
  }
});

test("full inventory and idempotency conflict are definitive rejections", async () => {
  for (const code of ["FULL", "IDEMPOTENCY_CONFLICT"]) {
    const result = await submitBookingAttempt(attempt, async () => http(409, { code, message: "Non disponible" }));
    assert.equal(result.kind, "rejected");
    assert.equal(result.error.code, code);
  }
});

test("invalid response body after HTTP 201 must not be treated as a confirmed booking", async () => {
  for (const bad of [null, {}, { ...booked, quantity: 7 }, { ...booked, remaining: -1 }]) {
    assert.equal((await submitBookingAttempt(attempt, async () => http(201, bad))).kind, "uncertain");
  }
});

test("invalid JSON after HTTP 201 keeps the request uncertain", async () => {
  const result = await submitBookingAttempt(attempt, async () => ({ status: 201, json: async () => { throw Error("truncated body"); } }));
  assert.equal(result.kind, "uncertain");
});

test("definitive 400 with invalid JSON still returns a rejection", async () => {
  const result = await submitBookingAttempt(attempt, async () => ({ status: 400, json: async () => { throw Error("bad JSON"); } }));
  assert.equal(result.kind, "rejected");
});