import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MessageHostButton } from "./message-host-button";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => Response.json({ success: true, data: { id: "cv_1" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("MessageHostButton", () => {
  test("opens the conversation about this listing", async () => {
    render(<MessageHostButton listingId="l13" />);

    await userEvent.click(screen.getByRole("button", { name: "Message host" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat/conversations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ listingId: "l13" });
    expect(push).toHaveBeenCalledWith("/inbox/cv_1");
  });

  test("shows why it failed and lets the guest try again", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, error: "Something went wrong" }, { status: 500 }));
    render(<MessageHostButton listingId="l13" />);

    await userEvent.click(screen.getByRole("button", { name: "Message host" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Message host" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
