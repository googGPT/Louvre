import { demoStore } from "../../../lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ workshops: demoStore.list(), mode: "single-process-demo" }, {
    headers: { "Cache-Control": "no-store" }
  });
}