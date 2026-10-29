import { ok } from "@/lib/api/envelope";
import { jsonError, withErrorEnvelope } from "@/lib/api/request";
import { getRepositories } from "@/lib/repositories";

/** One listing, seed or host: public catalog data (the assistant's details tool reads it). */
export const GET = withErrorEnvelope(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const listing = await getRepositories().listings.findById(id);
  return listing ? Response.json(ok(listing)) : jsonError(`Listing '${id}' was not found`, 404);
});
