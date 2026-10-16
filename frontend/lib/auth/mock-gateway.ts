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
  async register({ name, email }) {
    return session(userFromCredentials(email, name));
  },
  async login({ email }) {
    return session(userFromCredentials(email));
  },
  async logout() {},
  async me(token) {
    return decodeSession(token);
  },
  async providers() {
    return mockProviders();
  },
  async startExternal({ provider, email, link }, context) {
    const user = link ? decodeSession(context?.token) : null;
    if (link && !user) return LOG_IN;
    return startMockFlow({ provider, email }, user);
  },
  async completeExternal(input) {
    const result = completeMockFlow(input);
    return result.ok && "user" in result ? session(result.user) : result;
  },
  async connections(token) {
    const user = decodeSession(token);
    return user ? mockConnections(user) : null;
  },
  async disconnect(token, provider) {
    const user = decodeSession(token);
    return user ? disconnectMock(user, provider) : LOG_IN;
  },
};
