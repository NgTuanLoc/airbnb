import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@/lib/test-utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshWhilePending } from "./refresh-while-pending";

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RefreshWhilePending", () => {
  test("refreshes every three seconds", () => {
    render(<RefreshWhilePending />);

    vi.advanceTimersByTime(2999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("stops after two minutes", () => {
    render(<RefreshWhilePending />);

    vi.advanceTimersByTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(40);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(40);
  });

  test("stops when unmounted", () => {
    const { unmount } = render(<RefreshWhilePending />);

    unmount();
    vi.advanceTimersByTime(10_000);

    expect(refresh).not.toHaveBeenCalled();
  });
});
