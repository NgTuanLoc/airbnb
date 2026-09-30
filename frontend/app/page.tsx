import { TopNav, Footer } from "@/components/design-system";
import { StickyHomeSearch } from "@/components/features/search-bar/sticky-home-search";
import { HomeListings } from "@/components/features/home-listings";
import { CityLinkGrid } from "@/components/features/city-link-grid";
import { getRepositories } from "@/lib/repositories";

export default async function Home() {
  const cities = await getRepositories().cities.findAll();

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <StickyHomeSearch />
      <main id="main" className="mx-auto flex w-full max-w-listing flex-1 flex-col gap-12 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="sr-only">Stays, experiences and services on Airbnb</h1>
        <HomeListings />
        <CityLinkGrid cities={cities} />
      </main>
      <Footer />
    </div>
  );
}
