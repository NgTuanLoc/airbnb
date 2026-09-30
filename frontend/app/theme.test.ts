// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

test.each([
  ["--breakpoint-md", "744px"],
  ["--breakpoint-lg", "1128px"],
  ["--breakpoint-xl", "1440px"],
  ["--container-listing", "1440px"],
  ["--container-editorial", "1280px"],
])("the theme defines %s as %s (DESIGN.md Responsive Behavior)", (token, value) => {
  expect(css).toContain(`${token}: ${value};`);
});
