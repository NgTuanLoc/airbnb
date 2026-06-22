import { notFound } from "next/navigation";
import { mockExperienceRepository } from "@/lib/repositories/mock/mock-experience-repository";
import { mockHostRepository } from "@/lib/repositories/mock/mock-host-repository";
import { mockReviewRepository } from "@/lib/repositories/mock/mock-review-repository";
import { TopNav, Footer, RatingDisplay, HostCard } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";
import { ReviewsGrid } from "@/components/features/reviews-grid";

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experience = await mockExperienceRepository.findById(id);
  if (!experience) notFound();

  const [host, reviews] = await Promise.all([
    mockHostRepository.findById(experience.hostId),
    mockReviewRepository.findByListingId(experience.id),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="experiences" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <header className="py-6">
          <h1 className="text-display-sm text-ink">{experience.title}</h1>
          <p className="mt-1 text-body-md text-muted">
            {experience.location.city}, {experience.location.country} · {experience.durationHours} hours
          </p>
        </header>

        <ListingGallery photos={experience.photos} title={experience.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this experience</h2>
              <p className="text-body-md text-body">{experience.description}</p>
            </section>

            {host && (
              <div className="border-b border-hairline py-8">
                <HostCard host={host} />
              </div>
            )}

            <section className="pt-8">
              <RatingDisplay value={experience.rating} />
              <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                {experience.reviewCount} reviews
              </p>
              <ReviewsGrid reviews={reviews} />
            </section>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-hairline p-6 shadow-airbnb">
              <p className="text-title-md text-ink">${experience.pricePerPerson} <span className="text-body-sm text-muted">per person</span></p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
