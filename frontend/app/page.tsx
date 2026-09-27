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
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-6 py-8">
        <HomeListings />
        <CityLinkGrid cities={cities} />
      </main>
      <Footer />
    </div>
  );
}
