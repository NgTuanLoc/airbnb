import { ok } from "@/lib/api/envelope";
import { withErrorEnvelope } from "@/lib/api/request";
import { getRepositories } from "@/lib/repositories";

export const GET = withErrorEnvelope(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return Response.json(ok(await getRepositories().bookings.availability(id)));
});
