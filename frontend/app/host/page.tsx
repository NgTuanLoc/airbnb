import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { EarningsEstimate } from "@/components/features/host/earnings-estimate";
import { getSession } from "@/lib/auth/get-session";
import { HOST_CITIES, HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Airbnb it · Become a host" };

const STEPS = [
  { title: "Describe your place", body: "Tell guests what makes it special: the type of place, its size and what it offers." },
  { title: "Add photos", body: "Pick up to five photos. The first one is the cover guests see in search." },
  { title: "Set a price and publish", body: "Choose your nightly price. Your listing goes live right away." },
];

export default async function HostPage() {
  const repos = getRepositories();
  const user = await getSession();
  const [catalog, ownListings] = await Promise.all([
    repos.listings.findAll(),
    user ? repos.hostListings.listForHost(user.id) : Promise.resolve([]),
  ]);
  const seedCatalog = catalog.filter((l) => !l.id.startsWith(HOST_LISTING_ID_PREFIX));
  const cities = HOST_CITIES.map((city) => {
    const prices = seedCatalog.filter((l) => l.location.city === city.name).map((l) => l.pricePerNight);
    const averagePrice = prices.length ? Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length) : 0;
    return { id: city.id, name: city.name, averagePrice };
  });
  const cta = ownListings.length > 0
    ? { href: "/host/listings", label: "Go to your listings" }
    : { href: "/host/listings/new", label: "Get started" };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-16 px-6 py-12">
        <section className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-xl text-ink">
              Airbnb it. <span className="text-rausch">You could earn.</span>
            </h1>
            <p className="text-body-md text-body">Share your place with guests and earn money on your terms.</p>
            <Link href={cta.href} className={`${buttonClassName()} self-start`}>{cta.label}</Link>
          </div>
          <EarningsEstimate cities={cities} />
        </section>
        <section className="flex flex-col gap-6">
          <h2 className="text-display-md text-ink">How it works</h2>
          <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2 rounded-md border border-hairline p-6">
                <span className="text-title-sm text-muted">{index + 1}</span>
                <h3 className="text-title-md text-ink">{step.title}</h3>
                <p className="text-body-sm text-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
