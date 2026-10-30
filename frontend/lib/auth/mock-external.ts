import { z } from "zod";
import type { User } from "@/lib/types";
import type { Connection, ConnectionsInfo, GatewayFailure, ProvidersInfo, StartResult } from "./gateway";
import { userFromCredentials } from "./session";

// Mock mode's Google, GitHub and SSO (OAuth spec section 2, "Mock mode"): dev/test only, like the mock password
// login. The "provider" is the /auth/mock-provider page; its code is the readable identity the person typed.

const SOCIAL = [
  { id: "google", name: "Google" },
  { id: "github", name: "GitHub" },
];
/** The same demo connection Aspire's Keycloak serves in api mode. */
const SSO_CONNECTIONS = [{ id: "sso-acme", name: "Acme Corp", domains: ["acme.test"] }];
const FLOW_LIFETIME_MS = 10 * 60 * 1000;

interface Flow { provider: string; state: string; linkUser?: User; expiresAt: number }
interface Link { user: User; email: string; connectedAt: string }
interface Store {
  flows: Map<string, Flow>;
  /** `${provider}:${subject}` → the connected account. */
  links: Map<string, Link>;
}

// On globalThis so dev hot reload keeps it, like the mock repositories. A server restart clears it.
const store: Store = ((globalThis as { __mockExternalLogins?: Store }).__mockExternalLogins ??= { flows: new Map(), links: new Map() });

const identitySchema = z.object({ email: z.email(), name: z.string().max(60).optional() });
export type MockIdentity = z.infer<typeof identitySchema>;

const fail = (status: number, code: string, error: string): GatewayFailure => ({ ok: false, status, code, error });
const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1).toLowerCase();
const ssoFor = (email: string) => SSO_CONNECTIONS.find((connection) => connection.domains.includes(domainOf(email)));

/** The display name of a mock provider key, or null for one mock mode doesn't offer. */
export function mockProviderName(provider: string): string | null {
  return SOCIAL.find((p) => p.id === provider)?.name ?? SSO_CONNECTIONS.find((c) => c.id === provider)?.name ?? null;
}

/** The demo provider's authorization code: the identity the person typed, readable on purpose (mock mode only). */
export function encodeMockCode(identity: MockIdentity): string {
  return Buffer.from(JSON.stringify(identity), "utf8").toString("base64url");
}

function decodeMockCode(code: string): MockIdentity | null {
  try {
    const parsed = identitySchema.safeParse(JSON.parse(Buffer.from(code, "base64url").toString("utf8")));
    return parsed.success ? { ...parsed.data, email: parsed.data.email.trim().toLowerCase() } : null;
  } catch {
    return null;
  }
}

export function mockProviders(): ProvidersInfo {
  return { social: SOCIAL, sso: true };
}

export function startMockFlow(input: { provider: string; email?: string }, user: User | null): StartResult {
  let provider = input.provider;
  if (provider === "sso") {
    if (!input.email) return fail(400, "email_required", "Enter your work email to continue with single sign-on.");
    const connection = ssoFor(input.email);
    if (!connection) return fail(404, "sso_not_configured", "Single sign-on isn't set up for that email's domain.");
    provider = connection.id;
  } else if (!mockProviderName(provider)) {
    return fail(404, "provider_unavailable", "That sign-in option isn't available.");
  }

  const flowId = randomToken();
  const state = randomToken();
  const now = Date.now();
  for (const [id, flow] of store.flows) if (flow.expiresAt <= now) store.flows.delete(id);
  store.flows.set(flowId, { provider, state, linkUser: user ?? undefined, expiresAt: now + FLOW_LIFETIME_MS });

  const query = new URLSearchParams({ provider, state, redirect_uri: `/api/auth/callback/${provider}` });
  const loginHint = input.email?.trim().toLowerCase() ?? user?.email;
  if (loginHint) query.set("login_hint", loginHint);
  return { ok: true, authorizationUrl: `/auth/mock-provider?${query}`, flowId, provider };
}

export type MockCompletion = { ok: true; user: User } | { ok: true; linked: { provider: string; email: string } } | GatewayFailure;

/** The same callback rules as the backend, minus the email-collision rule: mock accounts are just emails. */
export function completeMockFlow(input: { provider: string; flowId: string; state: string; code: string }): MockCompletion {
  const flow = store.flows.get(input.flowId);
  store.flows.delete(input.flowId);
  if (!flow || flow.expiresAt <= Date.now()) return fail(400, "flow_expired", "Your sign-in attempt expired. Try again.");
  if (flow.provider !== input.provider || flow.state !== input.state) {
    return fail(400, "flow_mismatch", "That sign-in attempt doesn't match the one you started. Try again.");
  }
  const identity = decodeMockCode(input.code);
  if (!identity) return fail(400, "provider_error", "The sign-in provider's answer couldn't be verified. Try again.");
  const connection = SSO_CONNECTIONS.find((c) => c.id === flow.provider);
  if (connection && !connection.domains.includes(domainOf(identity.email))) {
    return fail(400, "email_domain_not_allowed", "That account's email isn't on a domain this single sign-on covers.");
  }
  return flow.linkUser ? connectIdentity(flow.provider, identity, flow.linkUser) : signInWith(flow.provider, identity);
}

// The demo provider's subject for a person is their email: one email is one provider account.
const linkKey = (provider: string, identity: MockIdentity) => `${provider}:${identity.email}`;

// Login & security's "connect": the signed-in user takes this provider account, unless someone else has it.
function connectIdentity(provider: string, identity: MockIdentity, user: User): MockCompletion {
  const key = linkKey(provider, identity);
  const existing = store.links.get(key);
  if (existing && existing.user.id !== user.id) return fail(409, "identity_in_use", "That account is already connected to another user.");
  if (!existing && connectionOf(user.id, provider)) {
    return fail(409, "provider_already_connected", "Your account is already connected to a different account with this provider. Disconnect it first.");
  }
  if (!existing) store.links.set(key, { user, email: identity.email, connectedAt: new Date().toISOString() });
  return { ok: true, linked: { provider, email: identity.email } };
}

// A sign-in: the account this provider account is connected to, or a new one for its email.
function signInWith(provider: string, identity: MockIdentity): MockCompletion {
  const key = linkKey(provider, identity);
  const existing = store.links.get(key);
  const user = existing?.user ?? userFromCredentials(identity.email, identity.name);
  if (!existing && !connectionOf(user.id, provider)) store.links.set(key, { user, email: identity.email, connectedAt: new Date().toISOString() });
  return { ok: true, user };
}

function connectionOf(userId: string, provider: string): Link | undefined {
  for (const [key, link] of store.links) if (link.user.id === userId && key.startsWith(`${provider}:`)) return link;
  return undefined;
}

export function mockConnections(user: User): ConnectionsInfo {
  const offered: { id: string; name: string; kind: Connection["kind"] }[] = SOCIAL.map((p) => ({ ...p, kind: "social" }));
  const sso = ssoFor(user.email);
  if (sso) offered.push({ id: sso.id, name: sso.name, kind: "sso" });
  const connections: Connection[] = offered.map(({ id, name, kind }) => {
    const link = connectionOf(user.id, id);
    return link ? { provider: id, name, kind, email: link.email, connectedAt: link.connectedAt } : { provider: id, name, kind };
  });
  // Any password works in mock mode, so every mock account has one.
  return { hasPassword: true, connections };
}

export function disconnectMock(user: User, provider: string): GatewayFailure | null {
  for (const [key, link] of store.links) {
    if (link.user.id === user.id && key.startsWith(`${provider}:`)) {
      store.links.delete(key);
      return null;
    }
  }
  return fail(404, "not_connected", "That sign-in method isn't connected.");
}
