import { prepareReservation } from "./reservation-contracts-3c5";
function verify(ok: boolean, why: string): void {
  if (!ok) throw new Error(why);
}
let passes = 0;
function test(name: string, body: unknown, session: string | null,
              success: boolean, expected?: string): void {
  const r = prepareReservation(body, session);
  verify(r.ok === success, `${name}: unexpected ok`);
  if (r.ok) {
    verify(r.value.ownerId === session, `${name}: ownerId must come from session`);
    verify(r.value.workshopId.length > 0, `${name}: missing ID`);
  } else if (expected) verify(r.error.code === expected, `${name}: unexpected error`);
  passes++;
}
test("valid", { workshopId: "meetup", quantity: 2 }, "alice", true);
test("forged owner is ignored", { workshopId: "meetup", quantity: 1, ownerId: "bob" }, "alice", true);
test("no identity", { workshopId: "meetup", quantity: 1 }, null, false, "MISSING_IDENTITY");
test("zero quantity", { workshopId: "meetup", quantity: 0 }, "alice", false, "INVALID_QUANTITY");
test("fractional quantity", { workshopId: "meetup", quantity: 1.5 }, "alice", false, "INVALID_QUANTITY");
test("missing workshop", { quantity: 1 }, "alice", false, "INVALID_WORKSHOP_ID");
test("null body", null, "alice", false, "INVALID_WORKSHOP_ID");
test("array body", [], "alice", false, "INVALID_WORKSHOP_ID");
test("over limit", { workshopId: "meetup", quantity: 21 }, "alice", false, "INVALID_QUANTITY");
verify(passes === 9, "missing cases");
console.log(`3C5 original domain-contract tests passed: ${passes}`);