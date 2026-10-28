import { jsonError, withErrorEnvelope } from "@/lib/api/request";
import { relayToApi } from "@/lib/api/relay";
import { dataSource } from "@/lib/data-source";
import { LISTING_ID_PATTERN } from "@/lib/insights/views";

/** Records one view of a listing (the beacon on listing pages); mock mode counts nothing. */
export const POST = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const source = dataSource();
  if (source.kind !== "api") return new Response(null, { status: 204 });
  const { id } = await params;
  // Also keeps "." and ".." from resolving to another backend path.
  if (!LISTING_ID_PATTERN.test(id)) return jsonError("Listing not found", 404);
  return relayToApi(source.baseUrl, `/api/listings/${id}/views`, request, { method: "POST", session: false });
});
