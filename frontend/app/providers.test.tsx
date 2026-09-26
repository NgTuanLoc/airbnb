import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { useQuery } from "@tanstack/react-query";
import { Providers } from "./providers";

function Probe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: async () => "ready" });
  return <span>{data ?? "loading"}</span>;
}

describe("Providers", () => {
  test("supplies a QueryClient so useQuery works", async () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });
});
