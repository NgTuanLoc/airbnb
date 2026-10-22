// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";
import { PUT } from "./[id]/route";
import { jsonRequest } from "@/lib/auth/test-helpers";
import { validInput } from "@/lib/host/test-fixtures";
import { PHOTO_OPTIONS } from "@/lib/host/options";

// Saving a listing with uploaded photos (api mode): every one must be ready and the signer's own.
const gateway = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

const READY = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a6";
const PENDING = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a7";
const FOREIGN = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a8";
const url = "http://localhost/api/host/listings";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("host listings with uploaded photos", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    gateway.me.mockResolvedValue({ id: "usr_host", name: "Hana", email: "hana@example.com" });
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const id = String(input).split("/").at(-1);
      if (id === READY) return Response.json({ success: true, data: { id, status: "ready" } });
      if (id === PENDING) return Response.json({ success: true, data: { id, status: "pending" } });
      return Response.json({ success: false, error: "Photo not found" }, { status: 404 });
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const save = (photos: string[]) => POST(jsonRequest(url, "POST", { ...validInput, photos }, "session=tok"));

  test("a pending photo can't be saved yet", async () => {
    const response = await save([`/api/photos/${READY}`, `/api/photos/${PENDING}`]);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Wait for photos to finish processing");
  });

  test("another user's photo is refused", async () => {
    const response = await save([`/api/photos/${FOREIGN}`]);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Remove photos that failed to upload");
  });

  test("ready photos save, and the listing can be edited with them", async () => {
    const created = await save([`/api/photos/${READY}`, PHOTO_OPTIONS[0]]);
    expect(created.status).toBe(201);
    const listing = (await created.json()).data;
    expect(listing.photos).toEqual([`/api/photos/${READY}`, PHOTO_OPTIONS[0]]);

    const updated = await PUT(jsonRequest(`${url}/${listing.id}`, "PUT",
      { ...validInput, title: "Renamed cabin", photos: [`/api/photos/${READY}`] }, "session=tok"), params(listing.id));
    expect(updated.status).toBe(200);

    const blocked = await PUT(jsonRequest(`${url}/${listing.id}`, "PUT",
      { ...validInput, photos: [`/api/photos/${PENDING}`] }, "session=tok"), params(listing.id));
    expect(blocked.status).toBe(400);
  });
});
