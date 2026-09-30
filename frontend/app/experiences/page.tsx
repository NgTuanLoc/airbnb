import { TopNav, Footer } from "@/components/design-system";
import { ExperienceListings } from "@/components/features/experience-listings";

export default function ExperiencesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="experiences" />
      <main className="mx-auto flex w-full max-w-listing flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-sm text-ink">Experiences</h1>
        <ExperienceListings />
      </main>
      <Footer />
    </div>
  );
}
