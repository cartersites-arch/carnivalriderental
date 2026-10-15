import { handleAcceptQuote } from "@/lib/requests/handlers";
import { protectedRequestRoute } from "@/lib/requests/protection";

export const dynamic = "force-dynamic";
export const POST = protectedRequestRoute(async (db, body, ctx: { params: Promise<{ reference: string }> }) => {
  const { reference } = await ctx.params;
  return handleAcceptQuote(db, reference, body);
});
