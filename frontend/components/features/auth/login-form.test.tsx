import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const login = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ login: (input: unknown) => login(input) }));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  login.mockReset();
});

async function fillAndSubmit(email: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), "supersecret");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginForm", () => {
  test("shows a validation error for an invalid email and does not call the API", async () => {
    render(<LoginForm />);
    await fillAndSubmit("nope");
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("logs in and navigates home by default", async () => {
    login.mockResolvedValue({ id: "u-a@b.com", name: "a", email: "a@b.com" });
    render(<LoginForm />);
    await fillAndSubmit("a@b.com");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "supersecret" });
    expect(refresh).toHaveBeenCalled();
  });

  test("goes back to the next path after logging in", async () => {
    login.mockResolvedValue({ id: "u-a@b.com", name: "a", email: "a@b.com" });
    render(<LoginForm next="/trips" />);
    await fillAndSubmit("a@b.com");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips"));
  });

  test("shows the API error and stays on the page", async () => {
    login.mockRejectedValue(new Error("Something went wrong"));
    render(<LoginForm />);
    await fillAndSubmit("a@b.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(push).not.toHaveBeenCalled();
  });

  test("keeps the next path on the sign-up link", () => {
    render(<LoginForm next="/trips" />);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register?next=%2Ftrips");
  });
});
