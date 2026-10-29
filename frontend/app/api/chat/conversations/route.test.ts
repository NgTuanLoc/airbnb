// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { jsonRequest } from "@/lib/auth/test-helpers";

const auth = vi.hoisted(() => ({ sessionFromRequest: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  sessionFromRequest: auth.sessionFromRequest,
}));

const repos = vi.hoisted(() => ({ listings: { findById: vi.fn() }, hosts: { findById: vi.fn() } }));
vi.mock("@/lib/repositories", () => ({ getRepositories: () => repos }));

import { POST } from "./route";

const guest = { id: "usr_guest", name: "Gus", email: "gus@example.com" };
const seedListing = { id: "l13", title: "Lakeside loft", hostId: "h13" };
const hostListing = { id: "hl-123", title: "Sunny cabin", hostId: "usr_host" };

const start = (body: unknown) => POST(jsonRequest("http://localhost/api/chat/conversations", "POST", body, "session=tok"));

describe("POST /api/chat/conversations", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    vi.stubEnv("CHAT_HTTP", "http://chat.test");
    vi.stubEnv("CHAT_SERVICE_KEY", "svc-key");
    auth.sessionFromRequest.mockResolvedValue(guest);
    repos.listings.findById.mockImplementation(async (id: string) => ({ l13: seedListing, "hl-123": hostListing })[id] ?? null);
    repos.hosts.findById.mockImplementation(async (id: string) => (id === "h13" ? { id: "h13", name: "Mara" } : null));
    fetchMock = vi.fn(async () => Response.json({ id: "cv_1" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    return { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body as string) };
  };

  test("needs a session", async () => {
    auth.sessionFromRequest.mockResolvedValue(null);

    expect((await start({ listingId: "l13" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("is 404 in mock mode: chat needs the backend", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");

    expect((await start({ listingId: "l13" })).status).toBe(404);
  });

  test("an unknown listing is 404", async () => {
    const response = await start({ listingId: "l999" });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("you can't message yourself about your own listing", async () => {
    auth.sessionFromRequest.mockResolvedValue({ id: "usr_host", name: "Hana", email: "hana@example.com" });

    expect((await start({ listingId: "hl-123" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a body without a listing is 400", async () => {
    expect((await start({})).status).toBe(400);
  });

  test("vouches for a seed listing's demo host and returns the conversation", async () => {
    const response = await start({ listingId: "l13" });

    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({ id: "cv_1" });
    const { url, headers, body } = sent();
    expect(url).toBe("http://chat.test/conversations");
    expect(headers.get("x-service-key")).toBe("svc-key");
    expect(body).toEqual({
      listingId: "l13",
      listingTitle: "Lakeside loft",
      hostId: "h13",
      hostName: "Mara",
      guestId: "usr_guest",
      guestName: "Gus",
      hostIsDemo: true,
    });
  });

  test("a host listing's host is a real person", async () => {
    await start({ listingId: "hl-123" });

    expect(sent().body).toMatchObject({ hostId: "usr_host", hostName: "Your host", hostIsDemo: false });
  });

  test("is 503 when the chat service isn't configured", async () => {
    vi.stubEnv("CHAT_SERVICE_KEY", "");

    expect((await start({ listingId: "l13" })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
