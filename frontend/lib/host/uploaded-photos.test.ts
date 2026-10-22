import { afterEach, describe, expect, test, vi } from "vitest";
import { PHOTO_OPTIONS } from "./options";
import { PHOTOS_FAILED, PHOTOS_PROCESSING, checkUploadedPhotos, uploadedPhotoId, uploadedPhotoUrl } from "./uploaded-photos";

const ID_A = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a6";
const ID_B = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a7";

function backendStatuses(statuses: Record<string, { status: string; reason?: string } | 404>) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const id = String(input).split("/").at(-1)!;
    const status = statuses[id];
    if (status === 404 || !status) return Response.json({ success: false, error: "Photo not found" }, { status: 404 });
    return Response.json({ success: true, data: { id, ...status } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("uploaded photo urls", () => {
  test("round-trip an id and refuse anything else", () => {
    expect(uploadedPhotoUrl(ID_A)).toBe(`/api/photos/${ID_A}`);
    expect(uploadedPhotoId(`/api/photos/${ID_A}`)).toBe(ID_A);
    expect(uploadedPhotoId("/api/photos/../x")).toBeNull();
    expect(uploadedPhotoId(`/api/photos/${ID_A.toUpperCase()}`)).toBeNull();
    expect(uploadedPhotoId(PHOTO_OPTIONS[0])).toBeNull();
  });
});

describe("checkUploadedPhotos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const apiMode = () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
  };

  test("stock photos need no check", async () => {
    apiMode();
    const fetchMock = backendStatuses({});
    expect(await checkUploadedPhotos([PHOTO_OPTIONS[0]], "tok")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("all ready passes, asking as the signed-in user", async () => {
    apiMode();
    const fetchMock = backendStatuses({ [ID_A]: { status: "ready" }, [ID_B]: { status: "ready" } });
    expect(await checkUploadedPhotos([uploadedPhotoUrl(ID_A), PHOTO_OPTIONS[0], uploadedPhotoUrl(ID_B)], "tok")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`http://api.test/api/photos/${ID_A}`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  test("a pending photo asks the host to wait", async () => {
    apiMode();
    backendStatuses({ [ID_A]: { status: "ready" }, [ID_B]: { status: "pending" } });
    expect(await checkUploadedPhotos([uploadedPhotoUrl(ID_A), uploadedPhotoUrl(ID_B)], "tok")).toBe(PHOTOS_PROCESSING);
  });

  test("another user's photo (404) or a rejected one must be removed", async () => {
    apiMode();
    backendStatuses({ [ID_A]: 404, [ID_B]: { status: "rejected", reason: "too_small" } });
    expect(await checkUploadedPhotos([uploadedPhotoUrl(ID_A)], "tok")).toBe(PHOTOS_FAILED);
    expect(await checkUploadedPhotos([uploadedPhotoUrl(ID_B)], "tok")).toBe(PHOTOS_FAILED);
  });

  test("mock mode has no uploads", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(await checkUploadedPhotos([uploadedPhotoUrl(ID_A)], "tok")).toBe(PHOTOS_FAILED);
  });

  test("the copy is fixed", () => {
    expect(PHOTOS_PROCESSING).toBe("Wait for photos to finish processing");
    expect(PHOTOS_FAILED).toBe("Remove photos that failed to upload");
  });
});
