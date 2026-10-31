import Link from "next/link";
import { CalendarX2, Users } from "lucide-react";
import { ExperienceGrid } from "@/components/features/experience-grid";
import { PropertyGrid } from "@/components/features/property-grid";
import type { Experience, Listing } from "@/lib/types";
import { RoomMap } from "./room-map";

// The room page's full-width bands below the reservation column, as on Airbnb's own listing pages.

const sectionClass = "border-t border-hairline py-12";
const headingClass = "mb-6 text-display-sm text-ink";

function Band({ id, title, children }: Readonly<{ id: string; title: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={id} className={sectionClass}>
      <h2 id={id} className={headingClass}>{title}</h2>
      {children}
    </section>
  );
}

export function WhereYoullBe({ listing }: Readonly<{ listing: Listing }>) {
  const place = `${listing.location.city}, ${listing.location.country}`;
  return (
    <Band id="where-youll-be" title="Where you’ll be">
      <p className="mb-6 text-title-sm text-ink">{place}</p>
      <div className="h-80 overflow-hidden rounded-md md:h-120">
        <RoomMap latitude={listing.location.lat} longitude={listing.location.lng} label={`${listing.title}, in ${place}`} />
      </div>
    </Band>
  );
}

/** Only what the app enforces: the guest cap, and free cancellation until the trip starts. */
export function ThingsToKnow({ listing }: Readonly<{ listing: Listing }>) {
  return (
    <Band id="things-to-know" title="Things to know">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="flex gap-4">
          <Users aria-hidden className="mt-0.5 size-6 shrink-0 text-ink" />
          <div>
            <h3 className="mb-1 text-title-md text-ink">House rules</h3>
            <p className="text-body-md text-body">{listing.maxGuests} guests maximum</p>
          </div>
        </div>
        <div className="flex gap-4">
          <CalendarX2 aria-hidden className="mt-0.5 size-6 shrink-0 text-ink" />
          <div>
            <h3 className="mb-1 text-title-md text-ink">Cancellation policy</h3>
            <p className="text-body-md text-body">Cancel before your trip starts and you won’t be charged.</p>
          </div>
        </div>
      </div>
    </Band>
  );
}

export function NearbyExperiences({ city, experiences }: Readonly<{ city: string; experiences: Experience[] }>) {
  if (experiences.length === 0) return null;
  return (
    <Band id="things-to-do" title={`Things to do in ${city}`}>
      <ExperienceGrid experiences={experiences} />
      <Link href="/experiences" className="mt-6 inline-block text-title-sm text-ink underline">
        Show all experiences
      </Link>
    </Band>
  );
}

export function NearbyStays({ city, listings }: Readonly<{ city: string; listings: Listing[] }>) {
  if (listings.length === 0) return null;
  return (
    <Band id="more-places" title={`More places to stay in ${city}`}>
      <PropertyGrid listings={listings} />
    </Band>
  );
}
