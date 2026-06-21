import Link from "next/link";
import { TopNav, Footer, SearchBar } from "@/components/design-system";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-8 px-10 py-16">
        <h1 className="text-display-xl text-ink">Find places to stay on Airbnb</h1>
        <SearchBar />
        <Link href="/design-system" className="text-body-md text-rausch underline">
          View the design system
        </Link>
      </main>
      <Footer />
    </div>
  );
}
