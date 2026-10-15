import { handleCreateRequest } from "@/lib/requests/handlers";
import { protectedRequestRoute } from "@/lib/requests/protection";

export const dynamic = "force-dynamic";
export const POST = protectedRequestRoute(handleCreateRequest);
