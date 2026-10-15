// @vitest-environment node
import { expect, test } from "vitest";
import { POST as start } from "./start/route";
import { GET as callback } from "../callback/[provider]/route";
import { GET as authorize } from "@/app/auth/mock-provider/authorize/route";
import { decodeSession, encodeSession, userFromCredentials } from "@/lib/auth/session";
import { jsonRequest } from "@/lib/auth/test-helpers";

// The whole browser journey in mock mode (the default DATA_SOURCE): our start route, the demo provider, our callback.
async function journey(body: object, email: string, sessionCookie?: string) {
  const started = await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", body, sessionCookie));
  expect(started.status).toBe(200);
  const flowCookie = started.headers.getSetCookie()[0].split(";")[0];
  const { data } = (await started.json()) as { data: { redirectUrl: string } };

  // The person fills in the demo provider's form.
  const page = new URL(data.redirectUrl, "http://localhost");
  const form = new URLSearchParams({ provider: page.searchParams.get("provider")!, state: page.searchParams.get("state")!, redirect_uri: page.searchParams.get("redirect_uri")!, email, name: "Ana Lima" });
  const authorized = await authorize(new Request(`http://localhost/auth/mock-provider/authorize?${form}`));
  expect(authorized.status).toBe(303);
  const back = new URL(authorized.headers.get("location")!, "http://localhost");

  const provider = back.pathname.split("/").at(-1)!;
  const cookies = [flowCookie, sessionCookie].filter(Boolean).join("; ");
  return callback(new Request(back, { headers: { cookie: cookies } }), { params: Promise.resolve({ provider }) });
}

test("Continue with GitHub signs in and goes back to next", async () => {
  const email = `ana-${crypto.randomUUID()}@example.com`;

  const response = await journey({ provider: "github", next: "/wishlists" }, email);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/wishlists");
  const session = response.headers.getSetCookie().find((c) => c.startsWith("session="))!;
  expect(decodeSession(session.split(";")[0].slice("session=".length))).toEqual(userFromCredentials(email, "Ana Lima"));
});

test("Continue with SSO signs in an acme.test email", async () => {
  const email = `alex-${crypto.randomUUID()}@acme.test`;
  const response = await journey({ provider: "sso", email, next: "/trips" }, email);
  expect(response.headers.get("location")).toBe("/trips");
});

test("connecting Google from Login & security comes back connected", async () => {
  const user = userFromCredentials(`ana-${crypto.randomUUID()}@example.com`);

  const response = await journey({ provider: "google", link: true }, `g-${crypto.randomUUID()}@gmail.com`, `session=${encodeSession(user)}`);

  expect(response.headers.get("location")).toBe("/account/security?connected=google");
});
