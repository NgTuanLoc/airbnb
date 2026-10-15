import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { SsoForm } from "./sso-form";

const startOAuth = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ startOAuth: (input: unknown) => startOAuth(input) }));
const navigateTo = vi.fn();
vi.mock("@/lib/navigation", () => ({ navigateTo: (url: string) => navigateTo(url) }));

beforeEach(() => {
  startOAuth.mockReset();
  navigateTo.mockReset();
});

async function submit(email: string) {
  await userEvent.type(screen.getByLabelText("Work email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("SsoForm", () => {
  test("an invalid email never reaches the API", async () => {
    render(<SsoForm />);
    await submit("alex");
    expect(screen.getByText("Enter a valid work email")).toBeInTheDocument();
    expect(startOAuth).not.toHaveBeenCalled();
  });

  test("sends the browser to the company's identity provider", async () => {
    startOAuth.mockResolvedValue({ redirectUrl: "http://localhost:8080/realms/acme/protocol/openid-connect/auth?x=1" });
    render(<SsoForm next="/trips" />);

    await submit("alex@acme.test");

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith("http://localhost:8080/realms/acme/protocol/openid-connect/auth?x=1"));
    expect(startOAuth).toHaveBeenCalledWith({ provider: "sso", email: "alex@acme.test", next: "/trips" });
  });

  test("says so inline when the domain has no single sign-on", async () => {
    startOAuth.mockRejectedValue(new Error("Single sign-on isn't set up for that email's domain."));
    render(<SsoForm />);

    await submit("alex@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Single sign-on isn't set up for that email's domain.");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
