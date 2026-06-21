import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await mockListingRepository.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
