// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { OAUTH_FLOW_COOKIE, clearedFlowCookie, flowCookie, flowFromRequest } from "./oauth-flow";

const flow = { id: "flow_abc-123", next: "/trips?x=1", intent: "login" as const };
const requestWith = (cookie: string) => new Request("http://localhost/api/auth/callback/google", { headers: { cookie } });

afterEach(() => vi.unstubAllEnvs());

test("the flow cookie round-trips through a request", () => {
  const value = flowCookie(flow).split(";")[0];
  expect(flowFromRequest(requestWith(`session=tok; ${value}`))).toEqual(flow);
});

test("it is httpOnly, Lax, scoped to the auth routes for ten minutes, and cleared the same way", () => {
  expect(flowCookie(flow)).toMatch(new RegExp(`^${OAUTH_FLOW_COOKIE}=[A-Za-z0-9_-]+; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600$`));
  expect(clearedFlowCookie()).toBe(`${OAUTH_FLOW_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`);
});

test("it is Secure in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(flowCookie(flow)).toMatch(/; Secure$/);
  expect(clearedFlowCookie()).toMatch(/; Secure$/);
});

test("a missing, garbled or wrong-shaped cookie is no flow", () => {
  expect(flowFromRequest(new Request("http://localhost/"))).toBeNull();
  expect(flowFromRequest(requestWith(`${OAUTH_FLOW_COOKIE}=%%%`))).toBeNull();
  const wrong = Buffer.from(JSON.stringify({ ...flow, id: "a; Domain=evil" })).toString("base64url");
  expect(flowFromRequest(requestWith(`${OAUTH_FLOW_COOKIE}=${wrong}`))).toBeNull();
  const intent = Buffer.from(JSON.stringify({ ...flow, intent: "admin" })).toString("base64url");
  expect(flowFromRequest(requestWith(`${OAUTH_FLOW_COOKIE}=${intent}`))).toBeNull();
});
