// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as upload } from "./route";
import { GET as status } from "./[id]/route";
import { GET as image } from "@/app/api/photos/[id]/route";

const gateway = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

const ID = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a6";
const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function multipart(cookie?: string): Request {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }), "photo.jpg");
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/host/photos", { method: "POST", body: form, headers });
}

function get(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

describe("photo relay routes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    gateway.me.mockReset();
    gateway.me.mockImplementation(async (token: string) => (token === "tok" ? user : null));
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("upload and status need a session", async () => {
    expect((await upload(multipart())).status).toBe(401);
    expect((await status(get(`http://localhost/api/host/photos/${ID}`), params(ID))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("upload forwards the multipart body with the bearer, type and browser IP, and returns the API's answer", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: { id: ID, status: "pending" } }, { status: 201 }));

    const response = await upload(multipart("session=tok"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { id: ID, status: "pending" } });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.test/api/photos");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    const sent = await new Response(init.body, { headers }).formData();
    expect((sent.get("file") as File).name).toBe("photo.jpg");
  });

  test("upload passes the API's refusal through", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, error: "Photos must be 10 MB or smaller", code: "photo_too_large" }, { status: 413 }));

    const response = await upload(multipart("session=tok"));

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("photo_too_large");
  });

  test("status forwards as the user", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: { id: ID, status: "ready" } }));

    const response = await status(get(`http://localhost/api/host/photos/${ID}`, "session=tok"), params(ID));

    expect((await response.json()).data.status).toBe("ready");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`http://api.test/api/photos/${ID}`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  test("the image streams with its caching headers, no session needed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", etag: "\"0x1\"" },
    }));

    const response = await image(get(`http://localhost/api/photos/${ID}`), params(ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("etag")).toBe("\"0x1\"");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetchMock.mock.calls[0][0])).toBe(`http://api.test/api/photos/${ID}/image`);
  });

  test("an unknown or malformed image id is 404", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, error: "Photo not found" }, { status: 404 }));
    expect((await image(get(`http://localhost/api/photos/${ID}`), params(ID))).status).toBe(404);
    expect((await image(get("http://localhost/api/photos/..%2Fx"), params("../x"))).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("all three are 404 in mock mode", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect((await upload(multipart("session=tok"))).status).toBe(404);
    expect((await status(get(`http://localhost/api/host/photos/${ID}`, "session=tok"), params(ID))).status).toBe(404);
    expect((await image(get(`http://localhost/api/photos/${ID}`), params(ID))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
