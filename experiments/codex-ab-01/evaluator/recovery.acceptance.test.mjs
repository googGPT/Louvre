import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Independent evaluator: do not place this file in the Codex coding snapshots.
// The candidate is asked to export these stable functions in TASK.md.
import {
  RECOVERY_KEY,
  savePending,
  readPending,
  clearPending
} from "../.domain-build/lib/recovery-storage.js";

const T0 = 1_790_000_000_000;
const payload = () => ({ workshopId: "nextjs-lab", quantity: 2, requestId: randomUUID() });
function mockStore() {
  const map = new Map();
  return {
    map,
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}
function badStore() {
  return {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
    removeItem() { throw new Error("storage blocked"); }
  };
}

test("key is a non-empty fixed name", () => {
  assert.equal(typeof RECOVERY_KEY, "string");
  assert.ok(RECOVERY_KEY.length >= 5);
});

test("store and restore precisely the original request", () => {
  const store = mockStore(), input = payload();
  assert.equal(savePending(store, input, T0), true);
  assert.deepEqual(readPending(store, T0 + 200), input);
  assert.deepEqual(readPending(store, T0 + 2000), input);
  assert.ok(store.getItem(RECOVERY_KEY));
});

test("write replaces a prior pending entry instead of accumulating entries", () => {
  const store = mockStore(), first = payload(), second = payload();
  savePending(store, first, T0);
  savePending(store, second, T0 + 1000);
  assert.deepEqual(readPending(store, T0 + 1001), second);
  assert.equal(store.map.size, 1);
});

test("entry older than 30 minutes expires and is purged", () => {
  const store = mockStore();
  savePending(store, payload(), T0);
  assert.equal(readPending(store, T0 + 30 * 60 * 1000 + 1), null);
  assert.equal(store.getItem(RECOVERY_KEY), null);
});

test("reading does not renew the expiration deadline", () => {
  const store = mockStore(), input = payload();
  savePending(store, input, T0);
  assert.deepEqual(readPending(store, T0 + 29 * 60 * 1000), input);
  assert.equal(readPending(store, T0 + 30 * 60 * 1000 + 1), null);
});

test("invalid JSON is ignored and purged", () => {
  const store = mockStore();
  store.setItem(RECOVERY_KEY, "{invalid-json");
  assert.equal(readPending(store, T0), null);
  assert.equal(store.getItem(RECOVERY_KEY), null);
});

test("unknown version is rejected", () => {
  const store = mockStore();
  savePending(store, payload(), T0);
  const value = JSON.parse(store.getItem(RECOVERY_KEY));
  value.version = 9999;
  store.setItem(RECOVERY_KEY, JSON.stringify(value));
  assert.equal(readPending(store, T0 + 1), null);
});

test("invalid or manipulated request data cannot be recovered", () => {
  for (const change of [
    p => { p.input.requestId = "not-a-uuid"; },
    p => { p.input.quantity = 20; },
    p => { p.input.workshopId = "unlisted"; },
    p => { p.input.userId = "spoofed"; }
  ]) {
    const store = mockStore();
    savePending(store, payload(), T0);
    const data = JSON.parse(store.getItem(RECOVERY_KEY));
    change(data);
    store.setItem(RECOVERY_KEY, JSON.stringify(data));
    assert.equal(readPending(store, T0 + 1), null);
  }
});

test("malformed saves are rejected, not persisted", () => {
  const store = mockStore();
  assert.equal(savePending(store, { ...payload(), quantity: 0 }, T0), false);
  assert.equal(savePending(store, { ...payload(), userId: "someone" }, T0), false);
  assert.equal(store.getItem(RECOVERY_KEY), null);
});

test("clear removes pending request", () => {
  const store = mockStore();
  savePending(store, payload(), T0);
  clearPending(store);
  assert.equal(readPending(store, T0 + 1), null);
});

test("blocked session storage is tolerated", () => {
  assert.equal(savePending(badStore(), payload(), T0), false);
  assert.equal(readPending(badStore(), T0), null);
  assert.doesNotThrow(() => clearPending(badStore()));
});