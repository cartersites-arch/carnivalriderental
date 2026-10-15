import { getDb, tx, type DB } from "@/lib/db";

export const MAX_REQUEST_BYTES = 32 * 1024;
export const REQUESTS_PER_MINUTE = 60;
const WINDOW_MS = 60_000;

export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "Request body too large" : "Invalid JSON");
  }
}

/** Count bytes while streaming, including bodies without Content-Length. */
export async function readRequestBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    void req.body?.cancel().catch(() => {});
    throw new RequestBodyError(413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new RequestBodyError(400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (e) {
    if (e instanceof RequestBodyError) throw e;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}

/** Database-wide budget. Do not trust caller-supplied forwarding/IP headers. */
export function takeRequestSlot(db: DB, now = Date.now()): number {
  return tx(db, () => {
    const row = db.prepare("SELECT window_started, hits FROM public_request_limit WHERE id = 1").get() as
      | { window_started: number; hits: number } | undefined;
    if (!row || now >= row.window_started + WINDOW_MS) {
      db.prepare("INSERT INTO public_request_limit (id, window_started, hits) VALUES (1, ?, 1) ON CONFLICT(id) DO UPDATE SET window_started = excluded.window_started, hits = 1").run(now);
      return 0;
    }
    if (row.hits >= REQUESTS_PER_MINUTE) return Math.max(1, Math.ceil((row.window_started + WINDOW_MS - now) / 1000));
    db.prepare("UPDATE public_request_limit SET hits = hits + 1 WHERE id = 1").run();
    return 0;
  });
}

/** Apply the same protection to all public request mutations. */
export function protectedRequestRoute<A extends unknown[]>(
  fn: (db: DB, body: unknown, ...args: A) => { status: number; body: Record<string, unknown> } | Promise<{ status: number; body: Record<string, unknown> }>,
) {
  return async (req: Request, ...args: A): Promise<Response> => {
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
      const result = await fn(db, await readRequestBody(req), ...args);
      return Response.json(result.body, { status: result.status, headers });
    } catch (e) {
      if (e instanceof RequestBodyError) {
        return Response.json({ error: e.status === 413 ? "request_too_large" : "bad_json" }, { status: e.status, headers });
      }
      console.error("[requests] unavailable", e instanceof Error ? e.message : e);
      return Response.json({ error: "unavailable", message: "We couldn't confirm that change. Please try again." }, { status: 503, headers });
    }
  };
}
