import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

describe("NewListingPage uploads", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("offers photo uploads only in api mode", async () => {
    session.requireSession.mockResolvedValue({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    const page = await NewListingPage();
    expect(page.props.children[1].props.children.props.uploadsEnabled).toBe(true);

    vi.stubEnv("DATA_SOURCE", "mock");
    const mockPage = await NewListingPage();
    expect(mockPage.props.children[1].props.children.props.uploadsEnabled).toBe(false);
  });
});
