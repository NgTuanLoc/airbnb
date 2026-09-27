import { getRepositories } from "@/lib/repositories";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await getRepositories().services.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
