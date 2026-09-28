import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NewListingPage from "./page";

beforeEach(() => session.requireSession.mockReset());

describe("NewListingPage", () => {
  test("is gated and shows the first step", async () => {
    session.requireSession.mockResolvedValue({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
    render(await NewListingPage());
    expect(session.requireSession).toHaveBeenCalledWith("/host/listings/new");
    expect(screen.getByRole("heading", { name: "Tell us about your place" })).toBeInTheDocument();
  });
});
