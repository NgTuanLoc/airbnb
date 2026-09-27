import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";
import { createWishlistSchema } from "@/lib/wishlists/schemas";

export async function GET(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  return Response.json(ok(await getRepositories().wishlists.listForUser(user.id)));
}

export async function POST(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, createWishlistSchema);
  if ("error" in body) return body.error;

  const repos = getRepositories();
  const { name, listingId } = body.data;
  if (listingId && !(await repos.listings.findById(listingId))) {
    return jsonError(`Listing '${listingId}' was not found`, 404);
  }

  const created = await repos.wishlists.create(user.id, name);
  const wishlist = listingId ? await repos.wishlists.addListing(user.id, created.id, listingId) : created;
  return Response.json(ok(wishlist), { status: 201 });
}
