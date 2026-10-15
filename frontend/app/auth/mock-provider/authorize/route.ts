import { z } from "zod";
import { withErrorEnvelope } from "@/lib/api/request";
import { dataSource } from "@/lib/data-source";
import { encodeMockCode, mockProviderName } from "@/lib/auth/mock-external";
import { isMockCallback } from "@/lib/auth/mock-provider";

const emailSchema = z.email();

/**
 * The demo provider's "Continue" (mock mode only): sends the browser back to the callback with a code that is the
 * identity typed on /auth/mock-provider. The callback must be this app's own route for the provider, so this is
 * never an open redirect.
 */
export const GET = withErrorEnvelope(async (request: Request) => {
  if (dataSource().kind !== "mock") return new Response(null, { status: 404 });
  const query = new URL(request.url).searchParams;
  const provider = query.get("provider") ?? "";
  const state = query.get("state") ?? "";
  const redirectUri = query.get("redirect_uri");
  if (!mockProviderName(provider) || !state || !isMockCallback(redirectUri, provider)) return new Response(null, { status: 400 });

  const email = (query.get("email") ?? "").trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    const back = new URLSearchParams({ provider, state, redirect_uri: redirectUri, error: "invalid_email" });
    if (email) back.set("login_hint", email);
    return new Response(null, { status: 303, headers: { Location: `/auth/mock-provider?${back}` } });
  }
  const name = (query.get("name") ?? "").trim().slice(0, 60) || undefined;
  const callback = new URLSearchParams({ code: encodeMockCode({ email, name }), state });
  return new Response(null, { status: 303, headers: { Location: `${redirectUri}?${callback}` } });
});
