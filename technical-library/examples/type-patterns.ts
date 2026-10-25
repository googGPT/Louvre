// Louvre knowledge library: original demonstration, not copied from the book.
export {}; // Ensure declarations stay in module scope.
// Source: Total TypeScript, chapter 15, PDF pages 362-379 and 384-387.

// TS15-001: Generic types and constraints.
type Identified = { id: string };
type LoadState<TContent extends Identified, TContext extends object = Record<string, never>> =
  | { kind: "ready"; content: TContent; context: TContext }
  | { kind: "missing"; reason: string };
type ArticleRead = LoadState<{ id: string; title: string }, { source: "cache" | "origin" }>;
function articleTitle(result: ArticleRead): string {
  return result.kind === "ready" ? result.content.title : result.reason;
}
// @ts-expect-error A content type without an id must be rejected.
type InvalidLoadState = LoadState<{ title: string }>;

// TS15-002: Template literal string patterns.
type ProjectRoute = `/projects/${string}`;
const validRoute: ProjectRoute = "/projects/abc";
// @ts-expect-error Not a /projects/ route.
const invalidRoute: ProjectRoute = "/users/abc";
function isProjectRoute(value: string): value is ProjectRoute {
  return /^\/projects\/[^/]+$/.test(value);
}

// TS15-003: Conditional types.
type AsReadonlyArray<T> = T extends readonly unknown[] ? T : readonly T[];
const singleKind: AsReadonlyArray<number> = [1, 2];
const existingArray: AsReadonlyArray<readonly string[]> = ["hello"];
// @ts-expect-error Scalar should not be assignable to an array type.
const invalidArray: AsReadonlyArray<number> = 12;

// TS15-004: Mapped types and key remapping.
type GetterFunctions<T> = {
  readonly [K in keyof T as K extends string ? `get${Capitalize<K>}` : never]: () => T[K];
};
type Report = { title: string; score: number };
const reportGetters: GetterFunctions<Report> = {
  getTitle: () => "Sample",
  getScore: () => 7,
};
const reportScore: number = reportGetters.getScore();
const invalidGetters: GetterFunctions<Report> = {
  getTitle: () => "Sample",
  // @ts-expect-error The getter must return a number.
  getScore: () => "seven",
};

// TS15-005: A discriminated Result type for expected failures.
type Result<T, E extends { message: string } = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
function parseAmount(raw: string): Result<number> {
  const amount = Number(raw);
  return Number.isFinite(amount)
    ? { ok: true, value: amount }
    : { ok: false, error: new Error("Invalid amount") };
}
function displayAmount(raw: string): string {
  const result = parseAmount(raw);
  return result.ok ? result.value.toFixed(2) : result.error.message;
}
function unsafeAccess(result: Result<number>): number {
  // @ts-expect-error Must narrow on ok before reading value.
  return result.value;
}

// Keep definitions reachable for type checking without runtime side effects.
void articleTitle;
void validRoute;
void invalidRoute;
void isProjectRoute;
void singleKind;
void existingArray;
void invalidArray;
void reportScore;
void invalidGetters;
void displayAmount;
void unsafeAccess;
