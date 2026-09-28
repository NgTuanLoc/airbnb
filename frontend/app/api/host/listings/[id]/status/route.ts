import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { listingStatusSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, listingStatusSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const listing = await getRepositories().hostListings.setStatus(user.id, id, body.data.status);
  return listing ? Response.json(ok(listing)) : jsonError("Listing not found", 404);
}
