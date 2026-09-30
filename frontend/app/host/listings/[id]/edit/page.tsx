import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { HostListingForm } from "@/components/features/host/host-listing-form";
import { requireSession } from "@/lib/auth/get-session";
import { toHostListingInput } from "@/lib/host/listing-input";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Edit listing · Airbnb" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/host/listings/${id}/edit`);
  const listing = await getRepositories().hostListings.findById(id);
  if (!listing || listing.hostId !== user.id) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="w-full flex-1 px-6 py-8">
        <HostListingForm mode="edit" listingId={listing.id} initial={toHostListingInput(listing)} />
      </main>
      <Footer />
    </div>
  );
}
