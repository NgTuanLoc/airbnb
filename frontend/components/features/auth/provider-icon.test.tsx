import { expect, test } from "vitest";
import { render } from "@/lib/test-utils";
import { ProviderIcon } from "./provider-icon";

test.each(["google", "github", "sso", "sso-acme", "other"])("%s gets a decorative mark", (provider) => {
  const { container } = render(<ProviderIcon provider={provider} />);
  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("aria-hidden");
  expect(svg?.getAttribute("class")).toContain("size-5");
});
