import { notFound } from "next/navigation";
import { getRepositories } from "@/lib/repositories";
import { TopNav, Footer, RatingDisplay } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await getRepositories().services.findById(id);
  if (!service) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="services" />
      <main className="mx-auto max-w-[1080px] px-6 md:px-10 pb-16">
        <header className="py-6">
          <h1 className="text-display-sm text-ink">{service.title}</h1>
          <p className="mt-1 text-body-md text-muted">
            {service.provider} · {service.serviceCategory} · {service.city}
          </p>
        </header>

        <ListingGallery photos={service.photos} title={service.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 md:grid-cols-[1fr_320px] lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this service</h2>
              <p className="text-body-md text-body">{service.description}</p>
            </section>
            <section className="pt-8">
              <RatingDisplay value={service.rating} />
              <p className="mt-2 text-center text-body-sm text-muted">{service.reviewCount} reviews</p>
            </section>
          </div>

          <div className="md:sticky md:top-24 md:self-start">
            <div className="rounded-lg border border-hairline p-6 shadow-airbnb">
              <p className="text-title-md text-ink">From ${service.price}</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
