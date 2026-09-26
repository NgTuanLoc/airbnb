import { notFound } from "next/navigation";
import { mockServiceRepository } from "@/lib/repositories/mock/mock-service-repository";
import { TopNav, Footer, RatingDisplay } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await mockServiceRepository.findById(id);
  if (!service) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="services" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <header className="py-6">
          <h1 className="text-display-sm text-ink">{service.title}</h1>
          <p className="mt-1 text-body-md text-muted">
            {service.provider} · {service.serviceCategory} · {service.city}
          </p>
        </header>

        <ListingGallery photos={service.photos} title={service.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
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

          <div className="lg:sticky lg:top-24 lg:self-start">
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
