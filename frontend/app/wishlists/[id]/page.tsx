import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { PropertyGrid } from "@/components/features/property-grid";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";
import type { Listing } from "@/lib/types";

export default async function WishlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/wishlists/${id}`);
  const repos = getRepositories();
  const wishlist = await repos.wishlists.findById(user.id, id);
  if (!wishlist) notFound();

  const listings = (await Promise.all(wishlist.listingIds.map((listingId) => repos.listings.findById(listingId)))).filter(
    (listing): listing is Listing => listing !== null,
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-listing flex-1 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="mb-8 text-display-md text-ink">{wishlist.name}</h1>
        {listings.length === 0 ? (
          <p className="text-body-md text-muted">Nothing saved yet</p>
        ) : (
          <PropertyGrid listings={listings} />
        )}
      </main>
      <Footer />
    </div>
  );
}
