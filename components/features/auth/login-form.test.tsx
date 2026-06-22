import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { LoginForm } from "./login-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());

describe("LoginForm", () => {
  test("shows a validation error for an invalid email and does not navigate", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test("navigates home on valid submit", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
