import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import type { Connection } from "@/lib/auth/gateway";
import { ConnectedAccounts } from "./connected-accounts";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const api = vi.hoisted(() => ({ startOAuth: vi.fn(), disconnectProvider: vi.fn() }));
vi.mock("@/lib/api-client/auth", () => api);
const navigateTo = vi.fn();
vi.mock("@/lib/navigation", () => ({ navigateTo: (url: string) => navigateTo(url) }));

const google: Connection = { provider: "google", name: "Google", kind: "social", email: "ana@gmail.com", connectedAt: "2031-01-01T00:00:00Z" };
const github: Connection = { provider: "github", name: "GitHub", kind: "social" };
const acme: Connection = { provider: "sso-acme", name: "Acme Corp", kind: "sso" };

beforeEach(() => {
  refresh.mockReset();
  navigateTo.mockReset();
  api.startOAuth.mockReset();
  api.disconnectProvider.mockReset();
});

describe("ConnectedAccounts", () => {
  test("shows each provider as connected or not, and labels SSO", () => {
    render(<ConnectedAccounts connections={[google, github, acme]} hasPassword />);
    expect(screen.getByText("Connected as ana@gmail.com")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected")).toHaveLength(2);
    expect(screen.getByText("Acme Corp (SSO)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeEnabled();
  });

  test("Connect starts a connect flow and sends the browser to the provider", async () => {
    api.startOAuth.mockResolvedValue({ redirectUrl: "https://github.com/login/oauth/authorize?x=1" });
    render(<ConnectedAccounts connections={[google, github]} hasPassword />);

    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?x=1"));
    expect(api.startOAuth).toHaveBeenCalledWith({ provider: "github", link: true });
  });

  test("Disconnect removes the connection and refreshes the page", async () => {
    api.disconnectProvider.mockResolvedValue(undefined);
    render(<ConnectedAccounts connections={[google, github]} hasPassword />);

    await userEvent.click(screen.getByRole("button", { name: "Disconnect Google" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.disconnectProvider).toHaveBeenCalledWith("google");
  });

  test("without a password, the only connected provider can't be disconnected", () => {
    render(<ConnectedAccounts connections={[google, github]} hasPassword={false} />);
    expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeDisabled();
    expect(screen.getByText("Connect another account before disconnecting this one.")).toBeInTheDocument();
  });

  test("a refused disconnect shows why", async () => {
    api.disconnectProvider.mockRejectedValue(new Error("Connect another sign-in method before disconnecting your only one."));
    render(<ConnectedAccounts connections={[google]} hasPassword />);

    await userEvent.click(screen.getByRole("button", { name: "Disconnect Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connect another sign-in method before disconnecting your only one.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
