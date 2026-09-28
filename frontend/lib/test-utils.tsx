import type { ReactElement, ReactNode } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

/**
 * Wraps components in a fresh QueryClientProvider, since the app always renders behind one (app/providers.tsx).
 * Uses RTL's `wrapper` option so `rerender` re-applies it too. Returns the client alongside the usual
 * render result so tests can spy on it (e.g. invalidateQueries).
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return {
    queryClient,
    ...rtlRender(ui, { ...options, wrapper: options?.wrapper ?? Wrapper }),
  };
}
