import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })) }));
const session = vi.hoisted(() => ({ requireSession: vi.fn(), getSessionToken: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
const gateway = vi.hoisted(() => ({ connections: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

import SecurityPage from "./page";
import SecurityLoading from "./loading";

const user = { id: "usr_1", name: "Ana", email: "ana@acme.test" };
const page = (query: Record<string, string> = {}) => SecurityPage({ searchParams: Promise.resolve(query) });
const info = {
  hasPassword: false,
  connections: [
    { provider: "google", name: "Google", kind: "social" as const, email: "ana@gmail.com", connectedAt: "2031-01-01T00:00:00Z" },
    { provider: "github", name: "GitHub", kind: "social" as const },
    { provider: "sso-acme", name: "Acme Corp", kind: "sso" as const },
  ],
};

beforeEach(() => {
  session.requireSession.mockReset().mockResolvedValue(user);
  session.getSessionToken.mockReset().mockResolvedValue("tok_abc");
  gateway.connections.mockReset().mockResolvedValue(info);
});

describe("SecurityPage", () => {
  test("is gated, and reads the connections as the signed-in user", async () => {
    render(await page());
    expect(session.requireSession).toHaveBeenCalledWith("/account/security");
    expect(gateway.connections).toHaveBeenCalledWith("tok_abc", { clientIp: "203.0.113.7" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Login & security");
  });

  test("shows the email, the password state and every provider", async () => {
    render(await page());
    expect(screen.getByText("ana@acme.test")).toBeInTheDocument();
    expect(screen.getByText("Not set: you log in with a connected account below.")).toBeInTheDocument();
    expect(screen.getByText("Connected as ana@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Acme Corp" })).toBeInTheDocument();
  });

  test("confirms a new connection by its name", async () => {
    render(await page({ connected: "google" }));
    expect(screen.getByRole("status")).toHaveTextContent("Google is now connected.");
  });

  test("explains a refused connection from its code", async () => {
    render(await page({ error: "identity_in_use", provider: "github" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That GitHub account is already connected to another account.");
  });

  test("a session the backend no longer knows goes back to log in", async () => {
    gateway.connections.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("NEXT_REDIRECT");
  });
});

test("loads with a busy main landmark", () => {
  render(<SecurityLoading />);
  expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  expect(screen.getAllByTestId("security-section-skeleton")).toHaveLength(2);
});
