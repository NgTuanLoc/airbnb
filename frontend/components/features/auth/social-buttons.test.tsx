import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { SocialButtons } from "./social-buttons";

const startOAuth = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ startOAuth: (input: unknown) => startOAuth(input) }));
const navigateTo = vi.fn();
vi.mock("@/lib/navigation", () => ({ navigateTo: (url: string) => navigateTo(url) }));

const providers = [{ id: "google", name: "Google" }, { id: "github", name: "GitHub" }];

beforeEach(() => {
  startOAuth.mockReset();
  navigateTo.mockReset();
});

describe("SocialButtons", () => {
  test("renders nothing when no provider is on", () => {
    const { container } = render(<SocialButtons providers={[]} sso={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("offers each provider and SSO, keeping next on the SSO link", () => {
    render(<SocialButtons providers={providers} sso next="/trips" />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with SSO" })).toHaveAttribute("href", "/login/sso?next=%2Ftrips");
    expect(screen.getByText("or")).toBeInTheDocument();
  });

  test("leaves SSO out when no connection exists", () => {
    render(<SocialButtons providers={providers} sso={false} />);
    expect(screen.queryByRole("link", { name: "Continue with SSO" })).not.toBeInTheDocument();
  });

  test("starts the provider's flow with next and sends the browser there", async () => {
    startOAuth.mockResolvedValue({ redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    render(<SocialButtons providers={providers} sso={false} next="/trips" />);

    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1"));
    expect(startOAuth).toHaveBeenCalledWith({ provider: "google", next: "/trips" });
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeDisabled();
  });

  test("shows a failure and lets the person try again", async () => {
    startOAuth.mockRejectedValue(new Error("That sign-in option isn't available."));
    render(<SocialButtons providers={providers} sso={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That sign-in option isn't available.");
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeEnabled();
  });

  test("uses the outlined button tokens", () => {
    render(<SocialButtons providers={providers} sso={false} />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.className).toContain("border-ink");
    expect(button.className).toContain("rounded-sm");
  });
});
