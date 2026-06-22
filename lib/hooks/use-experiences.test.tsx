import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useExperiences } from "./use-experiences";
import type { Experience } from "@/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function make(id: string): Experience {
  return { id, title: "x", location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" };
}

describe("useExperiences", () => {
  test("requests no category param when called with no argument", async () => {
    const original = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ success: true, data: [make("e1")] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const { result } = renderHook(() => useExperiences(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(requestedUrl).not.toContain("category=");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("fetches experiences for a category", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [make("e1")] }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const { result } = renderHook(() => useExperiences("Food & drink"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("e1");
    } finally {
      globalThis.fetch = original;
    }
  });
});
