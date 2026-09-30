import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";
import { TopNav, Footer, RatingDisplay, HostCard } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";
import { ListingOverview } from "@/components/features/listing-overview";
import { AmenityList } from "@/components/features/amenity-list";
import { ReviewsGrid } from "@/components/features/reviews-grid";
import { ReservationPanel } from "@/components/features/reservation-panel";
import { parseReservationQuery, toReservationInitDto, type ReservationQuery } from "@/lib/reservation/query";

type SearchParams = Record<string, string | string[] | undefined>;
const QUERY_KEYS = ["checkIn", "checkOut", "adults", "children"] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const rawQuery = await searchParams;
  const query: ReservationQuery = {};
  for (const key of QUERY_KEYS) {
    const value = first(rawQuery[key]);
    if (value !== undefined) query[key] = value;
  }
  const repos = getRepositories();
  const listing = await repos.listings.findById(id);
  if (!listing) notFound();

  const [host, reviews, viewer] = await Promise.all([
    repos.hosts.findById(listing.hostId),
    repos.reviews.findByListingId(listing.id),
    getSession(),
  ]);
  const isOwner = viewer?.id === listing.hostId;
  const isUnlisted = listing.status === "unlisted";
  const initial = toReservationInitDto(parseReservationQuery(query));

  return (
    <div className={`min-h-screen bg-canvas ${!isOwner && !isUnlisted ? "pb-24 md:pb-0" : ""}`}>
      <TopNav active="homes" />
      <main id="main" className="mx-auto max-w-[1080px] px-6 md:px-10 pb-16">
        <ListingOverview listing={listing} />
        <ListingGallery photos={listing.photos} title={listing.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 md:grid-cols-[1fr_320px] lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this place</h2>
              <p className="text-body-md text-body">{listing.description}</p>
            </section>

            <AmenityList amenities={listing.amenities} />

            {host && (
              <div className="border-b border-hairline py-8">
                <HostCard host={host} />
              </div>
            )}

            <section className="pt-8">
              {listing.reviewCount === 0 ? (
                <p className="text-center text-title-md text-ink">New · No reviews yet</p>
              ) : (
                <>
                  <RatingDisplay value={listing.rating} />
                  <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                    {listing.isGuestFavorite ? "Guest favorite · " : ""}{listing.reviewCount} reviews
                  </p>
                </>
              )}
              <ReviewsGrid reviews={reviews} />
            </section>
          </div>

          <div className="md:sticky md:top-24 md:self-start">
            {isOwner ? (
              <aside className="flex flex-col gap-3 rounded-md border border-hairline p-6 shadow-airbnb">
                <p className="text-title-md text-ink">This is your listing</p>
                <Link href={`/host/listings/${listing.id}/edit`} className="text-title-sm text-ink underline">Edit listing</Link>
                <Link href="/host/listings" className="text-title-sm text-ink underline">Manage listings</Link>
              </aside>
            ) : isUnlisted ? (
              <aside className="rounded-md border border-hairline p-6 shadow-airbnb">
                <p className="text-title-md text-ink">This place isn&apos;t taking bookings right now</p>
              </aside>
            ) : (
              <ReservationPanel listingId={listing.id} pricePerNight={listing.pricePerNight} maxGuests={listing.maxGuests} initial={initial} />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
