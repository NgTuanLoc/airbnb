import { withErrorEnvelope } from "@/lib/api/request";
import { getRepositories } from "@/lib/repositories";
import { ok } from "@/lib/api/envelope";

export const GET = withErrorEnvelope(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await getRepositories().experiences.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
});
