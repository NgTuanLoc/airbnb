import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";
import { addListingSchema } from "@/lib/wishlists/schemas";

export const POST = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, addListingSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const repos = getRepositories();
  if (!(await repos.listings.findById(body.data.listingId))) {
    return jsonError(`Listing '${body.data.listingId}' was not found`, 404);
  }
  const wishlist = await repos.wishlists.addListing(user.id, id, body.data.listingId);
  return wishlist ? Response.json(ok(wishlist)) : jsonError("Wishlist not found", 404);
});
