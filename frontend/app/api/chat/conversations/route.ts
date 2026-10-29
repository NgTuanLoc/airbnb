import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { chatService } from "@/lib/chat/config";
import { dataSource } from "@/lib/data-source";
import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { getRepositories } from "@/lib/repositories";

const REQUEST_TIMEOUT_MS = 5_000;
const startSchema = z.object({ listingId: z.string().min(1).max(64) });
const createdSchema = z.object({ id: z.string() });

/**
 * Opens the signed-in guest's conversation with a listing's host. Host listings live in this server, so only it can
 * vouch for who the host is: it tells the chat service with the shared service key (chat spec).
 */
export const POST = withErrorEnvelope(async (request: Request) => {
  if (dataSource().kind !== "api") return jsonError("Messaging needs the backend", 404);
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, startSchema);
  if ("error" in body) return body.error;
  const chat = chatService();
  if (!chat) return jsonError("Messaging isn't configured", 503);

  const repos = getRepositories();
  const listing = await repos.listings.findById(body.data.listingId);
  if (!listing) return jsonError(`Listing '${body.data.listingId}' was not found`, 404);
  if (listing.hostId === user.id) return jsonError("This is your own listing", 400);
  const host = await repos.hosts.findById(listing.hostId);

  const response = await fetch(new URL("/conversations", chat.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-key": chat.serviceKey },
    body: JSON.stringify({
      listingId: listing.id,
      listingTitle: listing.title,
      hostId: listing.hostId,
      hostName: host?.name ?? "Your host",
      guestId: user.id,
      guestName: user.name,
      // Seed listings' hosts have no accounts: the chat service answers for them once.
      hostIsDemo: !listing.id.startsWith(HOST_LISTING_ID_PREFIX),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const created = createdSchema.safeParse(await response.json().catch(() => undefined));
  if (!response.ok || !created.success) throw new Error(`POST /conversations failed with ${response.status}`);
  return Response.json(ok({ id: created.data.id }), { status: 201 });
});
