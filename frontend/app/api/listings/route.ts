import { withErrorEnvelope } from "@/lib/api/request";
import { getRepositories } from "@/lib/repositories";
import { ok } from "@/lib/api/envelope";

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const GET = withErrorEnvelope(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const data = await getRepositories().listings.findAll({
    location: searchParams.get("location") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    minPrice: num(searchParams.get("minPrice")),
    maxPrice: num(searchParams.get("maxPrice")),
    guests: num(searchParams.get("guests")),
    bedrooms: num(searchParams.get("bedrooms")),
    beds: num(searchParams.get("beds")),
    baths: num(searchParams.get("baths")),
  });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
});
