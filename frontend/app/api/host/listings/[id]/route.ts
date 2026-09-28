import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, hostListingInputSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const listing = await getRepositories().hostListings.update(user.id, id, body.data);
  return listing ? Response.json(ok(listing)) : jsonError("Listing not found", 404);
}
