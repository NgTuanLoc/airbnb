"use client";

import {
  Button,
  TextInput,
  RatingDisplay,
  SearchBar,
  TopNav,
  Footer,
} from "@/components/design-system";

export default function DesignSystemPage() {
  return (
    <div>
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-8 p-10">
        <h1 className="text-display-xl text-ink">Design System</h1>
        <SearchBar
          values={{ where: "Search destinations", when: "Add dates", who: "Add guests" }}
          activeSegment={null}
          onSegmentClick={() => {}}
          onSearch={() => {}}
        />
        <div className="flex gap-4">
          <Button>Reserve</Button>
          <Button variant="secondary">Save</Button>
          <Button variant="pill">Become a host</Button>
        </div>
        <TextInput label="Email" placeholder="you@example.com" />
        <RatingDisplay value={4.81} />
      </main>
      <Footer />
    </div>
  );
}
