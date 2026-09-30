import { TopNav, Footer } from "@/components/design-system";
import { ServiceListings } from "@/components/features/service-listings";

export default function ServicesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="services" />
      <main className="mx-auto flex w-full max-w-listing flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-sm text-ink">Services</h1>
        <ServiceListings />
      </main>
      <Footer />
    </div>
  );
}
