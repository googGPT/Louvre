// Louvre batch 3C1: original examples for the book-derived concepts.
// No source code copied from the book. Static type checks only.
export {};

// TS05-001: discriminated task state, not a bag of optionals.
type TaskState =
  | { phase: "queued" }
  | { phase: "done"; receipt: { id: string } }
  | { phase: "failed"; reason: string };

function assertUnreachable(value: never): never {
  throw new Error(`Unexpected state: ${String(value)}`);
}
function messageFor(state: TaskState): string {
  switch (state.phase) {
    case "queued": return "Queued";
    case "done": return `Done ${state.receipt.id}`;
    case "failed": return state.reason;
    default: return assertUnreachable(state);
  }
}
const goodState: TaskState = { phase: "done", receipt: { id: "R-1" } };
// @ts-expect-error A queued task cannot carry a receipt.
const invalidState: TaskState = { phase: "queued", receipt: { id: "R-2" } };

// TS10-001: derive types from a single source of truth.
const taskCodes = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
} as const;
type TaskCode = typeof taskCodes[keyof typeof taskCodes];
function renderTaskStatus(status: TaskCode): string { return status.toUpperCase(); }
const known: TaskCode = taskCodes.ACTIVE;
// @ts-expect-error Must reject an undeclared business status.
const unknown: TaskCode = "suspended";

void messageFor;
void goodState;
void invalidState;
void renderTaskStatus;
void known;
void unknown;