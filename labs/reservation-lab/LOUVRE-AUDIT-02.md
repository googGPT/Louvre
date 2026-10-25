# Louvre Engineering Audit 02 — Retry safety for ambiguous reservation outcomes

**Scope:** code review and implementation **by ChatGPT**, not an autonomous Codex execution. This branch alone cannot establish that Codex selected or implemented Louvre references independently.

## Finding and reproduction

The initial UI always created a fresh `crypto.randomUUID()` for every click. If `POST /api/reservations` committed a booking but the response was lost, the next manual attempt received a **different** request ID. The server's in-memory idempotency cache could not recognize it: a second reservation could be created when seats remained. The previous error message told users to check availability before retrying, but did not preserve the original request identifier.

## Louvre references deliberately consulted

- [`TS15-005`](../../technical-library/concepts/language-and-types/TS15-005-result-errors.md) — *Total TypeScript: The Essentials* chapter 15, PDF pages 375–379: discriminated outcomes. **Louvre adaptation:** `confirmed`, `rejected` and `uncertain` are local workflow states, not constructs copied from the book.
- [`NEXT08-001`](../../technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md) — *Ultimate Next.js* chapter 8, PDF pages 212–226: local client state versus server-authoritative inventory. **Louvre adaptation:** a pending request is local state, while only the API is authoritative for whether the booking exists.
- [`NEXT04-001`](../../technical-library/concepts/backend-and-apis/NEXT04-001-api-route-validation.md) — *Ultimate Next.js* chapter 4, pages 100, 102–103, 106, 108, 115–116: validate network-boundary data. **Louvre adaptation:** verify the returned receipt against the original request before declaring success.
- [`GHA12-001`](../../technical-library/concepts/devops/GHA12-001-reusable-workflows.md) — *Learning GitHub Actions* chapter 12, PDF pages 322–329: shared CI concepts. **Louvre adaptation:** add an existing-project test to the GitHub workflow rather than claiming an automated Codex Skill execution.

## Behavior changed

- A lost response, HTTP 408, 429, 5xx, or malformed success body leaves the original request pending.
- The UI **replays the original quantity, workshop and request ID**, even when the inventory display is now sold out.
- A validated 201 receipt confirms success; definitive 4xx rejections clear the pending request.
- While a request is unresolved, new bookings and modifications are blocked. A deliberate abandonment requires a warning confirmation and **does not cancel** any committed booking.
- Parsing booking responses is not blindly cast from JSON; a receipt is checked against the request.

## Evidence and limitations

Unit test: `tests/retry.test.mjs` runs with `npm run test:domain` after compiling `lib/booking-request.ts`. Eight tests cover the lost-acknowledgement/replay scenario, definitive rejection, server errors, malformed receipts and invalid JSON. Existing 12 booking tests and Next.js build / smoke tests remain in the workflow.

The extra eight tests passed locally with Node.js 22.16.0 and TypeScript 5.8.3. The full Next.js build, existing tests and HTTP smoke suite must pass in **GitHub Actions on this branch** before merging.

**Not a production guarantee:** pending state is lost on reload/tab close; request-id deduplication is in-memory and per process; a restart or a second replica can still duplicate bookings; no authentication, durable transactions, or persistent idempotency keys exist. No production-ready semantics are claimed.

## Distinguishing human-assisted from autonomous agent performance

This patch is a **Louvre-guided ChatGPT implementation**. A separate Codex run, with its invocation and trace visible, would be required to measure whether Codex independently discovered the repository instructions, selected the references, changed code and executed tests. Do not report this PR as that experiment.