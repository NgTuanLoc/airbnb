// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { mockAuthGateway } from "./mock-gateway";
import { encodeMockCode } from "./mock-external";
import { decodeSession, encodeSession, userFromCredentials } from "./session";

test("any valid login succeeds and me() reads the token back", async () => {
  const result = await mockAuthGateway.login({ email: " Ana@Example.com ", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user).toEqual({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
  expect(await mockAuthGateway.me(result.session.token)).toEqual(result.session.user);
});

test("register keeps the given name", async () => {
  const result = await mockAuthGateway.register({ name: "Ana Lima", email: "ana@example.com", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user.name).toBe("Ana Lima");
});

test("an unreadable token is logged out", async () => {
  expect(await mockAuthGateway.me("not-base64-json")).toBeNull();
});

describe("mock external sign-in", () => {
  afterEach(() => vi.useRealTimers());

  const unique = () => crypto.randomUUID().slice(0, 8);

  async function start(input: { provider: string; email?: string; link?: boolean }, token?: string) {
    const result = await mockAuthGateway.startExternal(input, { token });
    if (!result.ok) throw new Error(`start failed: ${result.error}`);
    const query = new URL(result.authorizationUrl, "http://localhost").searchParams;
    return { ...result, state: query.get("state")!, query };
  }

  test("offers Google, GitHub and SSO", async () => {
    expect(await mockAuthGateway.providers()).toEqual({ social: [{ id: "google", name: "Google" }, { id: "github", name: "GitHub" }], sso: true });
  });

  test("starting sends the browser to the demo provider page, which returns to this provider's callback", async () => {
    const started = await start({ provider: "google" });
    expect(started.authorizationUrl).toMatch(/^\/auth\/mock-provider\?/);
    expect(started.query.get("provider")).toBe("google");
    expect(started.query.get("redirect_uri")).toBe("/api/auth/callback/google");
    expect(started.flowId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.state).not.toBe(started.flowId);
  });

  test("SSO is found by email domain, with the email as the login hint", async () => {
    const started = await start({ provider: "sso", email: "Alex@ACME.test" });
    expect(started.provider).toBe("sso-acme");
    expect(started.query.get("login_hint")).toBe("alex@acme.test");
    expect(await mockAuthGateway.startExternal({ provider: "sso", email: "alex@example.com" })).toMatchObject({ ok: false, status: 404, code: "sso_not_configured" });
    expect(await mockAuthGateway.startExternal({ provider: "sso" })).toMatchObject({ ok: false, status: 400, code: "email_required" });
    expect(await mockAuthGateway.startExternal({ provider: "facebook" })).toMatchObject({ ok: false, status: 404, code: "provider_unavailable" });
  });

  test("a round trip signs in the person typed at the provider, and a replay is refused", async () => {
    const started = await start({ provider: "github" });
    const email = `ana-${unique()}@example.com`;
    const input = { provider: "github", flowId: started.flowId, state: started.state, code: encodeMockCode({ email, name: "Ana Lima" }) };

    const result = await mockAuthGateway.completeExternal(input);

    if (!result.ok || !("session" in result)) throw new Error("expected a session");
    expect(result.session.user).toEqual(userFromCredentials(email, "Ana Lima"));
    expect(decodeSession(result.session.token)).toEqual(result.session.user);
    expect(await mockAuthGateway.completeExternal(input)).toMatchObject({ ok: false, status: 400, code: "flow_expired" });
  });

  test("another provider's callback, another state or a garbled code is refused", async () => {
    const code = encodeMockCode({ email: `ana-${unique()}@example.com` });
    const a = await start({ provider: "google" });
    expect(await mockAuthGateway.completeExternal({ provider: "github", flowId: a.flowId, state: a.state, code })).toMatchObject({ code: "flow_mismatch" });
    const b = await start({ provider: "google" });
    expect(await mockAuthGateway.completeExternal({ provider: "google", flowId: b.flowId, state: "forged", code })).toMatchObject({ code: "flow_mismatch" });
    const c = await start({ provider: "google" });
    expect(await mockAuthGateway.completeExternal({ provider: "google", flowId: c.flowId, state: c.state, code: "garbled" })).toMatchObject({ code: "provider_error" });
  });

  test("a flow expires after ten minutes", async () => {
    vi.useFakeTimers();
    const started = await start({ provider: "google" });
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const code = encodeMockCode({ email: `ana-${unique()}@example.com` });
    expect(await mockAuthGateway.completeExternal({ provider: "google", flowId: started.flowId, state: started.state, code })).toMatchObject({ code: "flow_expired" });
  });

  test("SSO refuses an identity outside its domains", async () => {
    const started = await start({ provider: "sso", email: "alex@acme.test" });
    const code = encodeMockCode({ email: "alex@gmail.com" });
    expect(await mockAuthGateway.completeExternal({ provider: "sso-acme", flowId: started.flowId, state: started.state, code })).toMatchObject({ code: "email_domain_not_allowed" });
  });

  test("connecting needs a session, then shows on Login & security, signs in as that account, and disconnects", async () => {
    const user = userFromCredentials(`ana-${unique()}@acme.test`);
    const token = encodeSession(user);
    expect(await mockAuthGateway.startExternal({ provider: "github", link: true })).toMatchObject({ ok: false, status: 401 });

    const started = await start({ provider: "github", link: true }, token);
    expect(started.query.get("login_hint")).toBe(user.email);
    const gitHubEmail = `gh-${unique()}@example.com`;
    const linked = await mockAuthGateway.completeExternal({ provider: "github", flowId: started.flowId, state: started.state, code: encodeMockCode({ email: gitHubEmail }) });
    expect(linked).toEqual({ ok: true, linked: { provider: "github", email: gitHubEmail } });

    const info = await mockAuthGateway.connections(token);
    expect(info?.hasPassword).toBe(true);
    expect(info?.connections.map((c) => [c.provider, c.email])).toEqual([["google", undefined], ["github", gitHubEmail], ["sso-acme", undefined]]);

    const again = await start({ provider: "github" });
    const signIn = await mockAuthGateway.completeExternal({ provider: "github", flowId: again.flowId, state: again.state, code: encodeMockCode({ email: gitHubEmail }) });
    expect(signIn.ok && "session" in signIn && signIn.session.user).toEqual(user);

    expect(await mockAuthGateway.disconnect(token, "github")).toBeNull();
    expect(await mockAuthGateway.disconnect(token, "github")).toMatchObject({ ok: false, status: 404, code: "not_connected" });
    expect(await mockAuthGateway.connections("garbage")).toBeNull();
  });

  test("a provider account connected to someone else can't be connected again", async () => {
    const email = `shared-${unique()}@example.com`;
    const first = encodeSession(userFromCredentials(`one-${unique()}@example.com`));
    const second = encodeSession(userFromCredentials(`two-${unique()}@example.com`));
    const a = await start({ provider: "google", link: true }, first);
    await mockAuthGateway.completeExternal({ provider: "google", flowId: a.flowId, state: a.state, code: encodeMockCode({ email }) });

    const b = await start({ provider: "google", link: true }, second);
    expect(await mockAuthGateway.completeExternal({ provider: "google", flowId: b.flowId, state: b.state, code: encodeMockCode({ email }) })).toMatchObject({ status: 409, code: "identity_in_use" });
  });
});
