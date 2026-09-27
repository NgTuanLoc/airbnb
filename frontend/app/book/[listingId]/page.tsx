import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { ConfirmBookingButton } from "@/components/features/bookings/confirm-booking-button";
import { PriceBreakdownList } from "@/components/features/price-breakdown-list";
import { requireSession } from "@/lib/auth/get-session";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export const metadata: Metadata = { title: "Confirm and pay · Airbnb" };

type SearchParams = Record<string, string | string[] | undefined>;
const QUERY_KEYS = ["checkIn", "checkOut", "adults", "children"] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { listingId } = await params;
  const raw = await searchParams;
  const query: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = first(raw[key]);
    if (value !== undefined) query[key] = value;
  }
  await requireSession(`/book/${listingId}?${new URLSearchParams(query)}`);

  const parsed = bookingRequestSchema.safeParse({ listingId, ...query });
  if (!parsed.success) redirect(`/rooms/${listingId}`);
  const listing = await getRepositories().listings.findById(listingId);
  if (!listing) notFound();

  const request = parsed.data;
  const breakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(request.checkIn, request.checkOut));
  const guestCount = request.adults + request.children;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8">
        <h1 className="mb-8 text-display-md text-ink">Confirm and pay</h1>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4 border-b border-hairline pb-8">
              <h2 className="text-title-md text-ink">Your trip</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-title-sm text-ink">Dates</p>
                  <p className="text-body-md text-body">{formatDateRange(request.checkIn, request.checkOut)}</p>
                </div>
                <Link href={`/rooms/${listingId}`} className="text-title-sm text-ink underline">Edit</Link>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-title-sm text-ink">Guests</p>
                  <p className="text-body-md text-body">{guestCount} {guestCount === 1 ? "guest" : "guests"}</p>
                </div>
                <Link href={`/rooms/${listingId}`} className="text-title-sm text-ink underline">Edit</Link>
              </div>
            </section>
            <section className="flex flex-col gap-2 border-b border-hairline pb-8">
              <h2 className="text-title-md text-ink">Payment</h2>
              <p className="text-body-md text-muted">This is a demo — no payment details needed.</p>
            </section>
            <ConfirmBookingButton request={request} />
          </div>
          <aside className="flex flex-col gap-4 self-start rounded-md border border-hairline p-6 shadow-airbnb">
            <div className="flex gap-4 border-b border-hairline pb-4">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-sm">
                <Image src={listing.photos[0]} alt={listing.title} fill sizes="96px" className="object-cover" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-title-sm text-ink">{listing.title}</p>
                <p className="text-body-sm text-muted">★ {listing.rating.toFixed(2)} · {listing.location.city}</p>
              </div>
            </div>
            <PriceBreakdownList breakdown={breakdown} />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
