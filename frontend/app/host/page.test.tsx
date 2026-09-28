import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import HostPage from "./page";

beforeEach(() => session.getSession.mockReset());

describe("HostPage", () => {
  test("invites visitors to get started", async () => {
    session.getSession.mockResolvedValue(null);
    render(await HostPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Airbnb it");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/host/listings/new");
  });

  test("sends existing hosts to their listings", async () => {
    const id = `u-${crypto.randomUUID()}@example.com`;
    await getRepositories().hostListings.create(id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue({ id, name: "ana", email: "ana@example.com" });
    render(await HostPage());
    expect(screen.getByRole("link", { name: "Go to your listings" })).toHaveAttribute("href", "/host/listings");
  });

  test("a host listing's price does not shift its city's earnings estimate", async () => {
    session.getSession.mockResolvedValue(null);
    const before = render(await HostPage());
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    const beforeText = screen.getByText(/average of/).textContent;
    before.unmount();

    await getRepositories().hostListings.create(`u-${crypto.randomUUID()}@example.com`, {
      ...hostListingInputSchema.parse(validInput),
      cityId: "aspen",
      pricePerNight: 10_000,
    });

    session.getSession.mockResolvedValue(null);
    render(await HostPage());
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    expect(screen.getByText(beforeText!)).toBeInTheDocument();
  });
});
