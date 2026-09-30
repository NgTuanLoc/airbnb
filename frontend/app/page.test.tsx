import { expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/design-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/design-system")>()),
  TopNav: () => <header>nav</header>,
}));
vi.mock("@/components/features/search-bar/sticky-home-search", () => ({ StickyHomeSearch: () => null }));
vi.mock("@/components/features/home-listings", () => ({ HomeListings: () => <section>listings</section> }));

import Home from "./page";

test("the homepage has exactly one h1 and a #main landmark", async () => {
  render(await Home());
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main");
});
