import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { CancelTripButton } from "@/components/features/bookings/cancel-trip-button";
import { PriceBreakdownList } from "@/components/features/price-breakdown-list";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { id } = await params;
  const { confirmed } = await searchParams;
  const user = await requireSession(`/trips/${id}`);
  const repos = getRepositories();
  const booking = await repos.bookings.findById(user.id, id);
  if (!booking) notFound();
  const listing = await repos.listings.findById(booking.listingId);
  const isGuest = booking.guestId === user.id;
  const canCancel = isGuest && booking.status === "confirmed" && booking.checkIn > new Date().toISOString().slice(0, 10);
  const guestCount = booking.guests.adults + booking.guests.children;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-6 md:px-10 py-8">
        {confirmed === "1" && (
          <p className="rounded-md bg-surface-soft px-6 py-4 text-title-md text-ink">
            You&apos;re going to {listing?.location.city ?? "your stay"}!
          </p>
        )}
        {listing && (
          <Link href={`/rooms/${listing.id}`} className="flex items-center gap-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-sm">
              <Image src={listing.photos[0]} alt={listing.title} fill sizes="96px" className="object-cover" />
            </div>
            <span className="text-title-md text-ink">{listing.title}</span>
          </Link>
        )}
        <section className="flex flex-col gap-2 border-b border-hairline pb-6">
          <p className="text-body-md text-body">{formatDateRange(booking.checkIn, booking.checkOut)}</p>
          <p className="text-body-md text-body">{guestCount} {guestCount === 1 ? "guest" : "guests"}</p>
          {!isGuest && (
            <p className="text-body-md text-body">Reservation by {booking.guestName ?? booking.guestEmail ?? booking.guestId}</p>
          )}
          <p className="text-body-sm text-muted">
            Booking {booking.id.slice(0, 8)} · {booking.status === "cancelled" ? "Cancelled" : "Confirmed"}
          </p>
          {canCancel && <CancelTripButton bookingId={booking.id} />}
        </section>
        <PriceBreakdownList breakdown={booking.priceBreakdown} />
      </main>
      <Footer />
    </div>
  );
}
