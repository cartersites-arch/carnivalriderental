import { getRequestService } from "@/lib/requests";
import { handleCreateRequest } from "@/lib/requests/http";
import { protectedRequestRoute } from "@/lib/requests/protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = protectedRequestRoute((_db, body) => handleCreateRequest(body, getRequestService()));
