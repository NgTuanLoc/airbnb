import type { Metadata } from "next";
import { Footer, TopNav } from "@/components/design-system";
import { HostNav } from "@/components/features/host/host-nav";
import { requireSession } from "@/lib/auth/get-session";
import { splitTrips } from "@/lib/bookings/trips";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import type { Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Reservations · Airbnb" };

type Reservation = Booking & { guestId: string };

function ReservationList({ title, reservations, titles }: { title: string; reservations: Reservation[]; titles: Map<string, string> }) {
  if (reservations.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title-md text-ink">{title}</h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {reservations.map((r) => {
          const guests = r.guests.adults + r.guests.children;
          return (
            <li key={r.id} className="grid grid-cols-1 gap-1 py-4 md:grid-cols-4">
              <span className="text-title-sm text-ink">{titles.get(r.listingId) ?? "Your listing"}</span>
              <span className="text-body-sm text-body">{r.guestId.replace(/^u-/, "")}</span>
              <span className="text-body-sm text-body">
                <span>{formatDateRange(r.checkIn, r.checkOut)}</span> · {guests} {guests === 1 ? "guest" : "guests"}
              </span>
              <span className="text-body-sm text-ink">${r.priceBreakdown.total}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function HostReservationsPage() {
  const user = await requireSession("/host/reservations");
  const repos = getRepositories();
  const listings = await repos.hostListings.listForHost(user.id);
  const reservations = await repos.bookings.listForListings(listings.map((l) => l.id));
  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const { upcoming, past } = splitTrips(reservations, new Date().toISOString().slice(0, 10));

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-md text-ink">Reservations</h1>
        <HostNav active="reservations" />
        {reservations.length === 0 ? (
          <p className="text-body-md text-muted">No reservations yet</p>
        ) : (
          <>
            <ReservationList title="Upcoming" reservations={upcoming} titles={titles} />
            <ReservationList title="Past" reservations={past} titles={titles} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
