import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { RegisterForm } from "./register-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const register = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ register: (input: unknown) => register(input) }));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  register.mockReset();
});

async function fill(confirmPassword: string) {
  await userEvent.type(screen.getByLabelText("Name"), "Ana");
  await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
  await userEvent.type(screen.getByLabelText("Password"), "supersecret");
  await userEvent.type(screen.getByLabelText("Confirm password"), confirmPassword);
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
}

describe("RegisterForm", () => {
  test("shows an error when passwords do not match", async () => {
    render(<RegisterForm />);
    await fill("different1");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  test("registers and goes to the next path", async () => {
    register.mockResolvedValue({ id: "u-a@b.com", name: "Ana", email: "a@b.com" });
    render(<RegisterForm next="/wishlists" />);
    await fill("supersecret");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/wishlists"));
    expect(register).toHaveBeenCalledWith({ name: "Ana", email: "a@b.com", password: "supersecret", confirmPassword: "supersecret" });
  });

  test("shows the API error", async () => {
    register.mockRejectedValue(new Error("Something went wrong"));
    render(<RegisterForm />);
    await fill("supersecret");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
