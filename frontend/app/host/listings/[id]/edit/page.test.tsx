import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import EditListingPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => session.requireSession.mockReset());

describe("EditListingPage", () => {
  test("shows the owner's listing prefilled", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await EditListingPage(params(listing.id)));

    expect(session.requireSession).toHaveBeenCalledWith(`/host/listings/${listing.id}/edit`);
    expect(screen.getByLabelText("Title")).toHaveValue("Sunny cabin by the lake");
  });

  test("another host's listing is not found on the edit page", async () => {
    const listing = await getRepositories().hostListings.create(user().id, hostListingInputSchema.parse(validInput));
    session.requireSession.mockResolvedValue(user());
    await expect(EditListingPage(params(listing.id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
