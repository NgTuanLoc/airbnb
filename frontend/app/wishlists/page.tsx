import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav } from "@/components/design-system";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Wishlists · Airbnb" };

export default async function WishlistsPage() {
  const user = await requireSession("/wishlists");
  const repos = getRepositories();
  const wishlists = await repos.wishlists.listForUser(user.id);
  const covers = await Promise.all(
    wishlists.map(async (w) => (w.listingIds[0] ? (await repos.listings.findById(w.listingIds[0]))?.photos[0] ?? null : null)),
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-listing flex-1 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="mb-8 text-display-md text-ink">Wishlists</h1>
        {wishlists.length === 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-title-md text-ink">Create your first wishlist</h2>
            <p className="text-body-md text-muted">Tap the heart on any stay to save it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {wishlists.map((wishlist, index) => (
              <Link key={wishlist.id} href={`/wishlists/${wishlist.id}`} className="flex flex-col gap-2">
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-soft">
                  {covers[index] && <Image src={covers[index]} alt="" fill sizes="(max-width: 744px) 100vw, 25vw" className="object-cover" />}
                </div>
                <span className="text-title-sm text-ink">{wishlist.name}</span>
                <span className="text-body-sm text-muted">{wishlist.listingIds.length} saved</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
