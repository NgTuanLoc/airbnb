// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { GET as authorize } from "./route";

const url = (query: Record<string, string>) => new Request(`http://localhost/auth/mock-provider/authorize?${new URLSearchParams(query)}`);
const valid = { provider: "google", state: "st", redirect_uri: "/api/auth/callback/google", email: " Ana@Example.com ", name: "Ana" };

afterEach(() => vi.unstubAllEnvs());

test("sends the browser back to the callback with the typed identity as the code", async () => {
  const response = await authorize(url(valid));

  expect(response.status).toBe(303);
  const back = new URL(response.headers.get("location")!, "http://localhost");
  expect(back.pathname).toBe("/api/auth/callback/google");
  expect(back.searchParams.get("state")).toBe("st");
  expect(JSON.parse(Buffer.from(back.searchParams.get("code")!, "base64url").toString())).toEqual({ email: "ana@example.com", name: "Ana" });
});

test("only ever returns to this app's callback for that provider", async () => {
  for (const redirect_uri of ["https://evil.example/cb", "//evil.example/api/auth/callback/google", "/api/auth/callback/github"]) {
    expect((await authorize(url({ ...valid, redirect_uri }))).status).toBe(400);
  }
  expect((await authorize(url({ ...valid, provider: "facebook", redirect_uri: "/api/auth/callback/facebook" }))).status).toBe(400);
});

test("an invalid email goes back to the form with an error", async () => {
  const response = await authorize(url({ ...valid, email: "nope" }));

  const back = new URL(response.headers.get("location")!, "http://localhost");
  expect(back.pathname).toBe("/auth/mock-provider");
  expect(back.searchParams.get("error")).toBe("invalid_email");
  expect(back.searchParams.get("state")).toBe("st");
});

test("does not exist in api mode", async () => {
  vi.stubEnv("DATA_SOURCE", "api");
  vi.stubEnv("API_HTTP", "http://api.test");
  expect((await authorize(url(valid))).status).toBe(404);
});
