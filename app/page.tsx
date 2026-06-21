import { TopNav, SearchBar, Footer } from "@/components/design-system";
import { HomeListings } from "@/components/features/home-listings";
import { CityLinkGrid } from "@/components/features/city-link-grid";
import { cities } from "@/lib/data/cities";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <div className="flex justify-center border-b border-hairline px-6 pb-6">
        <SearchBar />
      </div>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-6 py-8">
        <HomeListings />
        <CityLinkGrid cities={cities} />
      </main>
      <Footer />
    </div>
  );
}
