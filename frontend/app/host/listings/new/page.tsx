import type { Metadata } from "next";
import { Footer, TopNav } from "@/components/design-system";
import { HostListingForm } from "@/components/features/host/host-listing-form";
import { requireSession } from "@/lib/auth/get-session";

export const metadata: Metadata = { title: "List your place · Airbnb" };

export default async function NewListingPage() {
  await requireSession("/host/listings/new");
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="w-full flex-1 px-6 py-8">
        <HostListingForm mode="create" />
      </main>
      <Footer />
    </div>
  );
}
