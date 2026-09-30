import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { requireSession } from "@/lib/auth/get-session";
import { splitTrips } from "@/lib/bookings/trips";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import type { Booking, Listing } from "@/lib/types";

export const metadata: Metadata = { title: "Trips · Airbnb" };

function TripCard({ booking, listing }: { booking: Booking; listing: Listing | undefined }) {
  return (
    <Link href={`/trips/${booking.id}`} className="flex gap-4 rounded-md border border-hairline p-4 hover:shadow-airbnb">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-sm bg-surface-soft">
        {listing && <Image src={listing.photos[0]} alt="" fill sizes="96px" className="object-cover" />}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-title-sm text-ink">{listing?.location.city ?? "Your stay"}</span>
        <span className="text-body-sm text-body">{formatDateRange(booking.checkIn, booking.checkOut)}</span>
        <span className="text-body-sm text-muted">Total ${booking.priceBreakdown.total}</span>
      </div>
    </Link>
  );
}

function TripSection({ title, trips, listings }: { title: string; trips: Booking[]; listings: Map<string, Listing> }) {
  if (trips.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title-md text-ink">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {trips.map((booking) => (
          <TripCard key={booking.id} booking={booking} listing={listings.get(booking.listingId)} />
        ))}
      </div>
    </section>
  );
}

export default async function TripsPage() {
  const user = await requireSession("/trips");
  const repos = getRepositories();
  const bookings = await repos.bookings.listForUser(user.id);
  const listingIds = [...new Set(bookings.map((b) => b.listingId))];
  const listings = new Map(
    (await Promise.all(listingIds.map((id) => repos.listings.findById(id))))
      .filter((listing): listing is Listing => listing !== null)
      .map((listing) => [listing.id, listing]),
  );
  const { upcoming, past } = splitTrips(bookings, new Date().toISOString().slice(0, 10));

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-md text-ink">Trips</h1>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-title-md text-ink">No trips booked… yet!</p>
            <Link href="/" className={buttonClassName()}>Start searching</Link>
          </div>
        ) : (
          <>
            <TripSection title="Upcoming" trips={upcoming} listings={listings} />
            <TripSection title="Past" trips={past} listings={listings} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
