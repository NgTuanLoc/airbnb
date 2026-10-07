import type { AuthGateway } from "./gateway";
import { decodeSession, encodeSession, userFromCredentials } from "./session";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const session = (user: ReturnType<typeof userFromCredentials>) => ({
  ok: true as const,
  session: { user, token: encodeSession(user), expiresAt: new Date(Date.now() + SEVEN_DAYS_MS).toISOString() },
});

// Dev/test only: any valid input logs in and the token is the readable user (spec section 2, "Mock mode security").
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
};
