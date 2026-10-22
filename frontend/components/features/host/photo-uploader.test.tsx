import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/lib/test-utils";
import { PhotoUploader } from "./photo-uploader";

const ID = "0192f3a4b5c6d7e8f9a0b1c2d3e4f5a6";
const MB = 1024 * 1024;

function file(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

const input = () => screen.getByLabelText("Upload photos") as HTMLInputElement;
const pick = (...files: File[]) => fireEvent.change(input(), { target: { files } });
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("PhotoUploader", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let statuses: Array<{ status: string; reason?: string }>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    statuses = [];
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ success: true, data: { id: ID, status: "pending" } }, { status: 201 });
      return Response.json({ success: true, data: { id: ID, ...(statuses.shift() ?? { status: "pending" }) } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("takes JPEG, PNG and WebP, several at once", () => {
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    expect(input()).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input()).toHaveAttribute("multiple");
  });

  test("refuses a file over 10 MB without uploading it", () => {
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    pick(file("big.jpg", "image/jpeg", 11 * MB));
    expect(screen.getByText("Photos must be 10 MB or smaller")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("refuses other types without uploading them", () => {
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    pick(file("cat.gif", "image/gif"));
    expect(screen.getByText("Use a JPEG, PNG or WebP photo")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads, shows the preview while processing, then hands over the photo", async () => {
    const onReady = vi.fn();
    render(<PhotoUploader remaining={5} onReady={onReady} />);

    pick(file("home.jpg", "image/jpeg"));
    expect(await screen.findByText("Processing…")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "home.jpg" })).toHaveAttribute("src", "blob:preview");
    const upload = fetchMock.mock.calls[0];
    expect(upload[0]).toBe("/api/host/photos");
    expect((upload[1].body as FormData).get("file")).toBeInstanceOf(File);

    statuses.push({ status: "ready" });
    await tick(2000);

    expect(onReady).toHaveBeenCalledWith(`/api/photos/${ID}`);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/host/photos/${ID}`, expect.anything());
    expect(screen.queryByText("Processing…")).not.toBeInTheDocument();
  });

  test("shows why a photo was rejected", async () => {
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    pick(file("tiny.jpg", "image/jpeg"));
    await screen.findByText("Processing…");

    statuses.push({ status: "rejected", reason: "too_small" });
    await tick(2000);

    expect(screen.getByText("Photos need to be at least 400 pixels on the short side")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove tiny.jpg" })).toBeInTheDocument();
  });

  test("shows the API's refusal of an upload", async () => {
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ success: false, error: "x", code: "photo_unsupported_type" }, { status: 415 }));
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    pick(file("fake.jpg", "image/jpeg"));
    expect(await screen.findByText("Use a JPEG, PNG or WebP photo")).toBeInTheDocument();
  });

  test("gives up after 60 seconds of processing and lets the host remove it", async () => {
    render(<PhotoUploader remaining={5} onReady={vi.fn()} />);
    pick(file("slow.jpg", "image/jpeg"));
    await screen.findByText("Processing…");

    await tick(60_000);

    expect(screen.getByText("Still processing — try again later")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove slow.jpg" }));
    expect(screen.queryByText("Still processing — try again later")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  test("is disabled when the listing has no photo slots left, and uploads no more than remain", () => {
    const { rerender } = render(<PhotoUploader remaining={0} onReady={vi.fn()} />);
    expect(input()).toBeDisabled();

    rerender(<PhotoUploader remaining={1} onReady={vi.fn()} />);
    pick(file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
