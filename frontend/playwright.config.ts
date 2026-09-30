import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", testMatch: /(mobile|a11y)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
