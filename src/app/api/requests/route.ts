import { getDb } from "@/lib/db";
import { handleCreateRequest } from "@/lib/requests/handlers";
import { readRequestBody, RequestBodyError, takeRequestSlot } from "@/lib/requests/protection";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const db = getDb();
    const retryAfter = takeRequestSlot(db);
    if (retryAfter) {
      void req.body?.cancel().catch(() => {});
      return Response.json({ error: "rate_limited", message: `Too many requests right now. Wait ${retryAfter} seconds before checking again.` }, {
        status: 429, headers: { ...headers, "Retry-After": String(retryAfter) },
      });
    }
    const body = await readRequestBody(req);
    const r = handleCreateRequest(db, body);
    return Response.json(r.body, { status: r.status, headers });
  } catch (e) {
    if (e instanceof RequestBodyError) {
      return Response.json({ error: e.status === 413 ? "request_too_large" : "bad_json" }, { status: e.status, headers });
    }
    console.error("[requests] unavailable", e instanceof Error ? e.message : e);
    return Response.json({ error: "not_saved", message: "Your request was not saved. Please try again." }, { status: 503, headers });
  }
}
