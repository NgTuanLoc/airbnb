import { notFound } from "next/navigation";
import { getRepositories } from "@/lib/repositories";
import { TopNav, Footer, RatingDisplay, HostCard } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";
import { ListingOverview } from "@/components/features/listing-overview";
import { AmenityList } from "@/components/features/amenity-list";
import { ReviewsGrid } from "@/components/features/reviews-grid";
import { ReservationCard } from "@/components/features/reservation-card";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repos = getRepositories();
  const listing = await repos.listings.findById(id);
  if (!listing) notFound();

  const [host, reviews] = await Promise.all([
    repos.hosts.findById(listing.hostId),
    repos.reviews.findByListingId(listing.id),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <ListingOverview listing={listing} />
        <ListingGallery photos={listing.photos} title={listing.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
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
              <RatingDisplay value={listing.rating} />
              <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                Guest favorite · {listing.reviewCount} reviews
              </p>
              <ReviewsGrid reviews={reviews} />
            </section>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <ReservationCard pricePerNight={listing.pricePerNight} maxGuests={listing.maxGuests} listingId={listing.id} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
