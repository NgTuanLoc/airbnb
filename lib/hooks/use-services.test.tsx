import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useServices } from "./use-services";
import type { Service } from "@/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function make(id: string): Service {
  return { id, title: "x", provider: "P", serviceCategory: "Chefs", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Rome", description: "d" };
}

describe("useServices", () => {
  test("fetches services for a category", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [make("s1")] }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const { result } = renderHook(() => useServices("Chefs"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("s1");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("requests no category param when called with no argument", async () => {
    const original = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ success: true, data: [make("s1")] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const { result } = renderHook(() => useServices(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(requestedUrl).not.toContain("category=");
    } finally {
      globalThis.fetch = original;
    }
  });
});
