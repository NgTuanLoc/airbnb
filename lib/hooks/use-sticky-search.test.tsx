import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useStickySearch } from "./use-sticky-search";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let lastCallback: ObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(cb: ObserverCallback) {
    lastCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeEach(() => {
  lastCallback = null;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function useHarness() {
  const ref = useRef<HTMLDivElement>(null);
  // Attach a node so the effect runs its observe path.
  if (!ref.current) ref.current = document.createElement("div");
  return useStickySearch(ref);
}

describe("useStickySearch", () => {
  test("starts not collapsed", () => {
    const { result } = renderHook(() => useHarness());
    expect(result.current).toBe(false);
  });

  test("collapses when the sentinel leaves the viewport", () => {
    const { result } = renderHook(() => useHarness());
    act(() => lastCallback?.([{ isIntersecting: false }]));
    expect(result.current).toBe(true);
  });

  test("expands again when the sentinel returns", () => {
    const { result } = renderHook(() => useHarness());
    act(() => lastCallback?.([{ isIntersecting: false }]));
    act(() => lastCallback?.([{ isIntersecting: true }]));
    expect(result.current).toBe(false);
  });
});
