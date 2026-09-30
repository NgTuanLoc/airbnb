import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { HostNav } from "@/components/features/host/host-nav";
import { ListingStatusButton } from "@/components/features/host/listing-status-button";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Your listings · Airbnb" };

export default async function HostListingsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const user = await requireSession("/host/listings");
  const listings = await getRepositories().hostListings.listForHost(user.id);
  const createdListing = listings.find((l) => l.id === created);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-md text-ink">Your listings</h1>
        <HostNav active="listings" />
        {createdListing && (
          <div className="flex items-center justify-between rounded-md bg-surface-soft px-6 py-4">
            <p className="text-title-md text-ink">Your listing is live</p>
            <Link href={`/rooms/${createdListing.id}`} className="text-title-sm text-ink underline">View listing</Link>
          </div>
        )}
        {listings.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-title-md text-ink">You don&apos;t have any listings yet</p>
            <Link href="/host/listings/new" className={buttonClassName()}>Create a listing</Link>
          </div>
        ) : (
          <>
            <Link href="/host/listings/new" className={`${buttonClassName("secondary")} self-start`}>Create a listing</Link>
            <ul className="flex flex-col divide-y divide-hairline">
              {listings.map((listing) => (
                <li key={listing.id} className="flex items-center gap-4 py-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-sm">
                    <Image src={listing.photos[0]} alt="" fill sizes="80px" className="object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-title-sm text-ink">{listing.title}</span>
                    <span className="text-body-sm text-muted">{listing.location.city} · ${listing.pricePerNight} night</span>
                  </div>
                  <span className="rounded-full border border-hairline px-3 py-1 text-caption text-ink">
                    {listing.status === "unlisted" ? "Unlisted" : "Listed"}
                  </span>
                  <Link href={`/rooms/${listing.id}`} className="text-title-sm text-ink underline">View</Link>
                  <Link href={`/host/listings/${listing.id}/edit`} className="text-title-sm text-ink underline">Edit</Link>
                  <ListingStatusButton listingId={listing.id} status={listing.status === "unlisted" ? "unlisted" : "listed"} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
