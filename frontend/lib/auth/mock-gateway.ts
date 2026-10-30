import type { User } from "@/lib/types";
import type { AuthGateway } from "./gateway";
import { completeMockFlow, disconnectMock, mockConnections, mockProviders, startMockFlow } from "./mock-external";
import { decodeSession, encodeSession, userFromCredentials } from "./session";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_IN = { ok: false as const, status: 401, error: "Log in to continue" };

const session = (user: User) => ({
  ok: true as const,
  session: { user, token: encodeSession(user), expiresAt: new Date(Date.now() + SEVEN_DAYS_MS).toISOString() },
});

// Dev/test only: any valid input logs in and the token is the readable user (spec section 2, "Mock mode security").
// Google, GitHub and SSO go through the demo provider page (OAuth spec section 2, "Mock mode").
export const mockAuthGateway: AuthGateway = {
  register({ name, email }) {
    return Promise.resolve(session(userFromCredentials(email, name)));
  },
  login({ email }) {
    return Promise.resolve(session(userFromCredentials(email)));
  },
  async logout() {},
  me(token) {
    return Promise.resolve(decodeSession(token));
  },
  providers() {
    return Promise.resolve(mockProviders());
  },
  startExternal({ provider, email, link }, context) {
    const user = link ? decodeSession(context?.token) : null;
    if (link && !user) return Promise.resolve(LOG_IN);
    return Promise.resolve(startMockFlow({ provider, email }, user));
  },
  completeExternal(input) {
    const result = completeMockFlow(input);
    return Promise.resolve(result.ok && "user" in result ? session(result.user) : result);
  },
  connections(token) {
    const user = decodeSession(token);
    return Promise.resolve(user ? mockConnections(user) : null);
  },
  disconnect(token, provider) {
    const user = decodeSession(token);
    return Promise.resolve(user ? disconnectMock(user, provider) : LOG_IN);
  },
};
