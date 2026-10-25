import { parseBookingInput } from "../../../lib/contracts";
import { demoStore } from "../../../lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8_192;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Envoyer application/json." }, { status: 415, headers: NO_STORE });
  }
  const length = Number(request.headers.get("content-length") || "0");
  if (length > MAX_BYTES) {
    return Response.json({ code: "PAYLOAD_TOO_LARGE", message: "Requête trop volumineuse." }, { status: 413, headers: NO_STORE });
  }
  let data: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES) {
      return Response.json({ code: "PAYLOAD_TOO_LARGE", message: "Requête trop volumineuse." }, { status: 413, headers: NO_STORE });
    }
    data = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ code: "INVALID_JSON", message: "JSON illisible." }, { status: 400, headers: NO_STORE });
  }
  const parsed = parseBookingInput(data);
  if (!parsed.ok) {
    return Response.json(parsed.error, { status: 400, headers: NO_STORE });
  }
  const outcome = demoStore.reserve(parsed.value);
  if (!outcome.ok) {
    const status = outcome.error.code === "FULL" || outcome.error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
    return Response.json(outcome.error, { status, headers: NO_STORE });
  }
  return Response.json(outcome.value, { status: 201, headers: NO_STORE });
}