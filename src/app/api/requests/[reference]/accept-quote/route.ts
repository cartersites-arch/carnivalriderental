import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestService } from "@/lib/requests";
import { verifyCustomerToken } from "@/lib/requests/access";
import { protectedRequestRoute } from "@/lib/requests/protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1), quoteId: z.string().uuid() });

export const POST = protectedRequestRoute(async (_db, body, ctx: { params: Promise<{ reference: string }> }) => {
  const { reference } = await ctx.params;
  const { token, quoteId } = bodySchema.parse(body);
  const svc = getRequestService();
  const request = svc.getByReference(reference);
  // Same response for unknown reference and bad token: do not reveal which requests exist.
  if (!request || !verifyCustomerToken(request.id, token)) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const updated = svc.acceptQuote(request.id, quoteId);
  return { status: 200, body: { ok: true, fulfilmentStatus: updated.fulfilmentStatus } };
});
